// config.emelander.ts — Emelander Family deployment configuration
//
// This is a real-world example showing a fully configured deployment.
// To use as your starting point:
//   cp config.emelander.ts config.ts
// Then edit config.ts with your own values (config.ts is gitignored).

export const config = {
  // Family & Tree Info
  familyName: 'Emelander',
  treeName: 'Emelander Family',
  description: 'Our family history and genealogy',
  owner: 'Steven Emelander',

  // Hero & CTA copy (displayed on the homepage)
  heroEyebrow: 'Family History & Genealogy',
  heroBody:
    'Tracing the Emelander (Amelander) family from the island of Ameland in Friesland, Netherlands across generations. Search below to explore details in our interactive family tree.',
  ctaHeading: 'Help build our family tree',
  ctaBody:
    "Know something we're missing? Register for a free account to browse the tree and add comments. Request editor access to add family members, dates, places, and photos.",

  // About Page
  // Links use markdown syntax: [text](url)
  // Person links use /goto?name=First+Last
  // Use {{adminEmail}} to reference the admin email
  // Paragraphs separated by \n\n, **bold** for emphasis
  about: {
    dedication:
      "EmelanderFamily.com was created as both a genealogy project and a technical experiment, an effort to document the Emelander (Amelander) family while building a modern framework for exploring family history. The site is powered by CloudFamilyTree, a system I developed to learn how to design and deploy complex, data-driven applications using Claude AI. It grew out of a hands-on learning process and a desire to create something others could enjoy. What began as a fun challenge has grown into a structured, evolving archive connecting our family's roots from Friesland in the Netherlands to later generations in the United States.\n\nThis project builds on the work of [Don Emelander](/goto?name=Donald+A+Emelander), who had a passion for our family heritage and loved sharing it with anyone who showed interest, including distant relatives like myself. In 2011, Don sent me a package in the mail that included his research, filled with his handwritten annotations. That package is what, years later, inspired me to build this site. Don passed away in 2021 before it was completed, but it is my hope that this site continues his spirit of exploring and sharing our family's history.",
    signature:
      '-Steven Emelander Jr (grandson of [Robert W Emelander](/goto?name=Robert+W+Emelander))',
    faqSections: [
      {
        title: 'Emelander Family',
        faqs: [
          {
            icon: '\uD83C\uDDF3\uD83C\uDDF1',
            question: 'What is the connection to the Netherlands?',
            answer:
              "The Emelander (originally Amelander) name traces back to the island of Ameland in the northern Netherlands. The family eventually emigrated to the United States. Don's research traced many branches back to their Dutch origins. You can read more in [his writeup about the family](https://hvnf.nl/genealogie/histories/Engels/Thosedays/TheAmelanders.htm).",
          },
          {
            icon: '\uD83C\uDF0D',
            question: 'How far back does the family tree go?',
            answer:
              'The tree goes back several hundred years for some branches, all the way to the 1600s and 1700s in the Netherlands. The depth varies by branch \u2014 some lines have very detailed records while others have gaps. Dutch church and civil records have been invaluable for the earlier generations.',
          },
          {
            icon: '\uD83D\uDCDA',
            question: 'Where does the data come from?',
            answer:
              "Many places! This data was compiled from what Don provided as well as data from freely available web resources. It was compiled using AI (ChatGPT and Claude) as well as manual efforts by volunteers to ensure accuracy and fix issues. It is far from perfect, and is a constant work in progress. A lot of effort is being made to ensure references are included in each person's bio and in contributed artifacts to help provide evidence for those who want to verify for themselves.",
          },
        ],
      },
      {
        title: 'Contributing',
        faqs: [
          {
            icon: '\u270D\uFE0F',
            question: 'How can I contribute or become an editor?',
            answer:
              'If you see any issues please [register](/register) an account and [report issues](/report-bug). Registering gives you the ability to share stories, memories, or facts about a family member on their wall or report data issues for an editor to later review and fix. If you want to become an editor, first of all thank you, all you have to do after you [register](/register) is request to be an editor in your [settings](/settings) page and I will get it for approval. It may take some time and I may reach out to verify who you are.',
          },
          {
            icon: '\uD83D\uDCF7',
            question: 'Can I upload photos or documents?',
            answer:
              "Only editors and administrators can upload artifacts (photos, documents, etc.) to a person's page. If you have a photo or document you'd like added, either request editor access or [contact me](mailto:{{adminEmail}}) and I can add it for you.",
          },
          {
            icon: '\uD83D\uDCAC',
            question: 'What is the Memorial Wall?',
            answer:
              "Each person's page has a Wall tab where registered users can share memories, stories, or facts about that family member. Think of it as a guestbook for each person. Anyone with a registered account can post on the wall.",
          },
          {
            icon: '\uD83D\uDC1B',
            question: 'How do I report a bug or incorrect information?',
            answer:
              'If you see data errors, missing info, or corrections needed for a person, visit their page and use the Issues tab to report it. If you see a bug with how the site works, use [Report Bug](/report-bug) from the menu. Both require a registered account.',
          },
        ],
      },
      {
        title: 'CloudFamilyTree',
        faqs: [
          {
            icon: '\u2728',
            question: 'What makes this site special?',
            answer:
              "This site is completely free, has no ads, no restrictions, and no subscriptions. Family tree information shouldn't be behind a paywall. Unlike many genealogy services, there are no limits on how much you can view or how many people you can look up.\n\nIt is built on a modern, scalable architecture designed to stay fast even with large data sets. The site is carefully designed to work well on mobile devices, though the interactive tree view does require some horizontal scrolling on smaller screens.",
          },
          {
            icon: '\uD83D\uDCBB',
            question: 'What is CloudFamilyTree?',
            answer:
              'CloudFamilyTree is the open-source framework this site is built on. It was built with the assistance of Claude Code, but with a ton of guidance, tweaking, and manual edits. It is designed to be low cost to operate by using serverless autoscaling solutions. It uses AWS CDK to deploy to an AWS account and uses Lambda and API Gateway for the API, DynamoDB for data storage, S3 to store web content and artifacts, CloudFront to serve up web content, and Cognito for user management. Like the data itself, it is still a work in progress.',
          },
          {
            icon: '\uD83C\uDFE0',
            question: 'Can I use CloudFamilyTree for my own family?',
            answer:
              'Yes! CloudFamilyTree is open source and available on GitHub. It is designed to be deployable for any family with a single config file change. If you run into trouble or have questions, [contact me](mailto:{{adminEmail}}) and I am happy to help.',
          },
        ],
      },
    ],
  },

  // AWS Settings
  awsRegion: 'us-west-2',
  awsAccount: '515051181937',

  // Admin User (created automatically during deployment)
  admin: {
    email: 'emeland4@gmail.com',
    name: 'Steven Emelander',
  },

  // Domain Configuration
  domain: {
    enabled: true,
    name: 'emelanderfamily.com',
    hostedZoneId: 'Z1E40MUOSBXTHJ',
  },

  // Access Control
  access: {
    requireAuthForRead: false, // false = public read, true = auth required for everything
  },

  // Photo Settings
  photos: {
    maxFileSizeMB: 5,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
  },

  // Monitoring & Alerts
  monitoring: {
    alertEmail: 'emeland4@gmail.com',
    monthlyBudgetUSD: 25,
  },
} as const;

export type Config = typeof config;
