# Rift Sense

Rift Sense is a calm planning workspace for teams. It emphasizes supportive language, shared context, and lightweight collaboration signals without ranking or grading.

## Getting started

### Install dependencies
```bash
npm install
```

### Configure environment
Create a `.env` file with your SQLite database path:
```bash
DATABASE_URL="file:./dev.db"
```

### Run migrations and seed data
```bash
npm run prisma:migrate
npm run prisma:seed
```

### Start the dev server
```bash
npm run dev
```

Visit `http://localhost:3000`.

## Extension notes
- Add authentication and per-team permissions before sharing real data.
- Replace the sample in-memory UI data with Prisma queries in server components.
- Consider adding server actions for plan updates to keep timelines, assignments, and notes in sync.
- Add richer markdown formatting as needed while keeping sanitization enabled.
