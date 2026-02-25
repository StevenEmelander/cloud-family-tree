import type { Person } from '@cloud-family-tree/shared';
import { ENTITY_PREFIX, Gender, GSI_NAMES } from '@cloud-family-tree/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonRepository } from '../../src/repositories/person.repository';

// Mock DynamoDB client
const mockSend = vi.fn();
vi.mock('../../src/lib/dynamodb', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
  TableNames: { People: 'test-people-table' },
}));

// Mock the DynamoDB commands to capture inputs
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  GetCommand: vi.fn().mockImplementation(function (input) {
    return { ...input, _cmd: 'Get' };
  }),
  PutCommand: vi.fn().mockImplementation(function (input) {
    return { ...input, _cmd: 'Put' };
  }),
  QueryCommand: vi.fn().mockImplementation(function (input) {
    return { ...input, _cmd: 'Query' };
  }),
  UpdateCommand: vi.fn().mockImplementation(function (input) {
    return { ...input, _cmd: 'Update' };
  }),
  DeleteCommand: vi.fn().mockImplementation(function (input) {
    return { ...input, _cmd: 'Delete' };
  }),
  BatchWriteCommand: vi.fn().mockImplementation(function (input) {
    return { ...input, _cmd: 'BatchWrite' };
  }),
}));

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    personId: 'id-1',
    firstName: 'John',
    lastName: 'Doe',
    gender: Gender.MALE,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRecord(person: Person) {
  return {
    ...person,
    PK: `${ENTITY_PREFIX.PERSON}#${person.personId}`,
    SK: ENTITY_PREFIX.METADATA,
    GSI1PK: ENTITY_PREFIX.PERSON,
    GSI1SK: `${ENTITY_PREFIX.LASTNAME}#${person.lastName.toUpperCase()}#${ENTITY_PREFIX.FIRSTNAME}#${person.firstName.toUpperCase()}`,
    searchName: `${person.firstName} ${person.lastName}`.toUpperCase(),
  };
}

describe('PersonRepository', () => {
  let repo: PersonRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PersonRepository();
  });

  describe('searchByName', () => {
    it('finds people by last name', async () => {
      const bokkes = makePerson({
        personId: 'id-bokkes',
        firstName: 'Antje',
        lastName: 'Bokkes',
      });
      // DynamoDB applies the contains(searchName, :search) filter server-side
      mockSend.mockResolvedValueOnce({
        Items: [makeRecord(bokkes)],
        LastEvaluatedKey: undefined,
      });

      const result = await repo.searchByName('Bokkes');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].firstName).toBe('Antje');
      expect(result.items[0].lastName).toBe('Bokkes');
    });

    it('finds people by first name', async () => {
      const bokke1 = makePerson({
        personId: 'id-1',
        firstName: 'Bokke',
        lastName: 'Amelander',
      });
      const bokke2 = makePerson({
        personId: 'id-2',
        firstName: 'Bokke',
        lastName: 'Jacobs',
      });
      mockSend.mockResolvedValueOnce({
        Items: [makeRecord(bokke1), makeRecord(bokke2)],
        LastEvaluatedKey: undefined,
      });

      const result = await repo.searchByName('Bokke');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].firstName).toBe('Bokke');
      expect(result.items[1].firstName).toBe('Bokke');
    });

    it('search is case-insensitive', async () => {
      const person = makePerson({
        personId: 'id-1',
        firstName: 'Antje',
        lastName: 'Bokkes',
      });
      mockSend.mockResolvedValueOnce({
        Items: [makeRecord(person)],
        LastEvaluatedKey: undefined,
      });

      const result = await repo.searchByName('bokkes');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].lastName).toBe('Bokkes');
    });

    it('uses contains filter on non-key searchName attribute', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      await repo.searchByName('Smith');

      const queryCall = mockSend.mock.calls[0][0];
      expect(queryCall.FilterExpression).toBe('contains(searchName, :w0)');
      expect(queryCall.ExpressionAttributeValues[':w0']).toBe('SMITH');
      expect(queryCall.IndexName).toBe(GSI_NAMES.PEOPLE_NAME_INDEX);
    });

    it('paginates through all results', async () => {
      const person1 = makePerson({ personId: 'id-1', firstName: 'Bokke', lastName: 'A' });
      const person2 = makePerson({ personId: 'id-2', firstName: 'Bokke', lastName: 'B' });

      mockSend.mockResolvedValueOnce({
        Items: [makeRecord(person1)],
        LastEvaluatedKey: { PK: 'some-key' },
      });
      mockSend.mockResolvedValueOnce({
        Items: [makeRecord(person2)],
        LastEvaluatedKey: undefined,
      });

      const result = await repo.searchByName('Bokke');
      expect(result.items).toHaveLength(2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('returns empty array for no matches', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      const result = await repo.searchByName('Zzzzzzz');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('returns person when found', async () => {
      const person = makePerson();
      mockSend.mockResolvedValueOnce({ Item: makeRecord(person) });

      const result = await repo.findById('id-1');
      expect(result).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: test assertion — verified not null on previous line
      expect(result!.firstName).toBe('John');
      // biome-ignore lint/style/noNonNullAssertion: test assertion — verified not null on previous line
      expect(result!.lastName).toBe('Doe');
      // Should strip DynamoDB keys
      expect((result as Record<string, unknown>).PK).toBeUndefined();
      expect((result as Record<string, unknown>).SK).toBeUndefined();
    });

    it('returns null when not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('stores person with correct DynamoDB keys', async () => {
      mockSend.mockResolvedValueOnce({});
      const person = makePerson();

      await repo.create(person);

      const putCall = mockSend.mock.calls[0][0];
      expect(putCall.Item.PK).toBe(`${ENTITY_PREFIX.PERSON}#id-1`);
      expect(putCall.Item.SK).toBe(ENTITY_PREFIX.METADATA);
      expect(putCall.Item.GSI1PK).toBe(ENTITY_PREFIX.PERSON);
      expect(putCall.Item.GSI1SK).toBe(
        `${ENTITY_PREFIX.LASTNAME}#DOE#${ENTITY_PREFIX.FIRSTNAME}#JOHN`,
      );
      expect(putCall.Item.searchName).toBe('JOHN DOE');
    });
  });

  describe('findAll', () => {
    it('queries the NameIndex GSI', async () => {
      mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

      await repo.findAll(100);

      const queryCall = mockSend.mock.calls[0][0];
      expect(queryCall.IndexName).toBe(GSI_NAMES.PEOPLE_NAME_INDEX);
      expect(queryCall.KeyConditionExpression).toBe('GSI1PK = :pk');
      expect(queryCall.ExpressionAttributeValues[':pk']).toBe(ENTITY_PREFIX.PERSON);
    });
  });
});
