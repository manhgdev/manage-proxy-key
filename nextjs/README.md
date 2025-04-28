# Proxy Key Manager

A simple web application to manage your proxy keys efficiently.

## Features

- Add, edit, and delete proxy keys
- Toggle key activation status
- View key expiration dates
- Display proxy information

## Getting Started

1. Install dependencies:
```bash
bun install
```

2. Run the development server:
```bash
bun dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Technologies Used

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS 

src/
├── app/
│   ├── components/
│   │   ├── common/
│   │   │   └── Toast.tsx
│   │   └── proxy/
│   │       ├── ProxyKeyCard.tsx
│   │       └── ProxyKeyManager.tsx
├── server/
│   ├── api/
│   │   └── keys/
│   │       ├── route.ts
│   │       ├── toggle-auto-run/
│   │       │   └── route.ts
│   │       └── auto-run-status/
│   │           └── route.ts
│   ├── database/
│   │   ├── index.ts
│   │   └── schema.ts
│   └── services/
│       └── proxyService.ts
└── shared/
    └── types/
        └── proxy.ts