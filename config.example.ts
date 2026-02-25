// config.example.ts — CloudFamilyTree blank configuration template
//
// USAGE: Copy this file to config.ts and fill in your values.
//   cp config.example.ts config.ts
//
// config.ts is gitignored — your deployment values stay local.
// See README.md for full documentation of each field.

export const config = {
  // ── Family & Tree Info ────────────────────────────────────────────────────
  // familyName is used as a prefix for all AWS resource names (stack names,
  // Lambda functions, S3 buckets, etc.). Use a short CamelCase string with
  // no spaces or special characters, e.g. 'Smith', 'OBrien', 'VanDerBerg'.
  familyName: 'YourFamily',
  treeName: 'Your Family Tree',
  description: 'Our family history and genealogy',
  owner: 'Your Name',

  // ── Homepage Copy ─────────────────────────────────────────────────────────
  heroEyebrow: 'Family History & Genealogy',
  heroBody:
    'Explore our interactive family tree. Search below to find family members and discover connections across generations.',
  ctaHeading: 'Help build our family tree',
  ctaBody:
    "Know something we're missing? Register for a free account to browse the tree and add comments. Request editor access to add family members, dates, places, and photos.",

  // ── About Page ────────────────────────────────────────────────────────────
  // Supports markdown links: [text](url)
  // Person links: /goto?name=First+Last
  // Reference admin email: {{adminEmail}}
  // Separate paragraphs with \n\n, bold with **text**
  about: {
    dedication:
      "Welcome to our family tree. This site was built using **CloudFamilyTree**, an open-source self-hosted genealogy platform.\n\nAdd your family's story here — who started this project, what inspired it, and who you're honoring with it.",
    signature: '-Your Name',
    faqSections: [
      {
        title: 'The Data',
        faqs: [
          {
            icon: '📖',
            question: 'Where does the data come from?',
            answer:
              'Our data was compiled from family records, public archives, and contributions from family members. It is a constant work in progress — if you spot an error or have information to add, please let us know.',
          },
          {
            icon: '💬',
            question: 'What is the Memorial Wall?',
            answer:
              "Each person's page has a Wall tab where registered users can share memories, stories, or facts about that family member. Think of it as a guestbook for each person. Anyone with a registered account can post.",
          },
          {
            icon: '📷',
            question: 'Can I upload photos or documents?',
            answer:
              "Only editors and administrators can upload artifacts (photos, documents, etc.) to a person's page. If you have a photo or document you'd like added, either request editor access or [contact us](mailto:{{adminEmail}}) and we can add it for you.",
          },
          {
            icon: '✍️',
            question: 'How can I contribute or become an editor?',
            answer:
              'If you see any issues please [register](/register) an account and [report issues](/report-bug). Registering lets you share stories and memories. To become an editor and add or update records, request editor access from your [settings](/settings) page.',
          },
          {
            icon: '🐛',
            question: 'How do I report a bug or incorrect information?',
            answer:
              "For data errors or corrections, visit the person's page and use the Issues tab. For site bugs, use [Report Bug](/report-bug) from the menu. Both require a registered account.",
          },
        ],
      },
      {
        title: 'The Platform',
        faqs: [
          {
            icon: '✨',
            question: 'What makes this site special?',
            answer:
              "This site is completely free, has no ads, no restrictions, and no subscriptions. Family tree information shouldn't be behind a paywall.\n\nIt is built on a modern, scalable serverless architecture designed to stay fast even with large datasets, and works well on mobile devices.",
          },
          {
            icon: '💻',
            question: 'What is CloudFamilyTree?',
            answer:
              'CloudFamilyTree is the open-source framework this site is built on. It uses AWS CDK to deploy a fully serverless stack: Lambda + API Gateway for the API, DynamoDB for storage, S3 + CloudFront for the frontend, and Cognito for user management. It is designed to be low-cost to operate and straightforward to deploy for any family.',
          },
          {
            icon: '🏠',
            question: 'Can I use CloudFamilyTree for my own family?',
            answer:
              'Yes! CloudFamilyTree is open source under the AGPL-3.0 license. Visit the [GitHub repository](https://github.com/your-org/cloud-family-tree) to get started. The entire deployment is configured from a single `config.ts` file.',
          },
        ],
      },
    ],
  },

  // ── AWS Settings ──────────────────────────────────────────────────────────
  // Find your account ID: aws sts get-caller-identity --query Account --output text
  awsRegion: 'us-east-1',
  awsAccount: '123456789012',

  // ── Admin User ────────────────────────────────────────────────────────────
  // This Cognito user is created automatically on first deploy with admin role.
  admin: {
    email: 'admin@example.com',
    name: 'Your Name',
  },

  // ── Domain Configuration ──────────────────────────────────────────────────
  // Set enabled: false to use the auto-generated CloudFront/API Gateway URLs
  // instead of a custom domain. When enabled: true, you must have a Route 53
  // hosted zone for the domain in the same AWS account.
  // Find your hosted zone ID: aws route53 list-hosted-zones
  domain: {
    enabled: false,
    name: 'yourfamily.com',
    hostedZoneId: 'YOUR_ROUTE53_HOSTED_ZONE_ID',
  },

  // ── Access Control ────────────────────────────────────────────────────────
  access: {
    requireAuthForRead: false, // false = public read, true = login required to view
  },

  // ── Photo Settings ────────────────────────────────────────────────────────
  photos: {
    maxFileSizeMB: 5,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
  },

  // ── Monitoring & Alerts ───────────────────────────────────────────────────
  monitoring: {
    alertEmail: 'admin@example.com', // receives CloudWatch alarm notifications
    monthlyBudgetUSD: 25, // AWS budget alert threshold
  },
} as const;

export type Config = typeof config;
