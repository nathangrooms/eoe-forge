# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/2f059547-9563-4a32-99d1-6c6d5b026e3b

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/2f059547-9563-4a32-99d1-6c6d5b026e3b) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/2f059547-9563-4a32-99d1-6c6d5b026e3b) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Licences and attribution

DeckMatrix's rules core in `src/lib/game/` is architecturally derived from
[XMage](https://github.com/magefree/mage), which is MIT-licensed. XMage's model of a game of
Magic — turn/phase/step structure, state-based actions, combat, the continuous-effects layer
system, the stack, replacement effects and triggered abilities — is the design DeckMatrix ports
into pure, seeded, JSON-serialisable TypeScript. No XMage source is copied or vendored, and none
of its ~25,000 scripted card classes are ported; card behaviour is compiled from Scryfall oracle
text instead.

DeckMatrix deliberately derives **nothing** from [Card-Forge/forge](https://github.com/Card-Forge/forge),
which is GPL-3.0.

Full notices, the XMage MIT text, the file-by-file derivation table and the record of the
Forge-contamination check are in **[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)**.

Card data comes from [Scryfall](https://scryfall.com/docs/api). Magic: The Gathering is a
trademark of Wizards of the Coast LLC; DeckMatrix is unofficial Fan Content and is not approved
or endorsed by Wizards.
