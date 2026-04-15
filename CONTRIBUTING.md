# Contributing to astro-llms-md

Thank you for your interest in contributing to astro-llms-md! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:

- Being respectful and inclusive
- Welcoming newcomers
- Focusing on constructive feedback
- Maintaining a harassment-free environment

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm, yarn, or pnpm
- Git

### Fork the Repository

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/astro-llms-md.git
   cd astro-llms-md
   ```

3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/tfmurad/astro-llms-md.git
   ```

## Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a test Astro project:**
   ```bash
   # In a separate directory
   npm create astro@latest test-project
   cd test-project
   npm install
   ```

3. **Link the integration for local development:**
   ```bash
   # In your test project
   npm link /path/to/astro-llms-md
   ```

4. **Add the integration to test project:**
   ```javascript
   // astro.config.mjs
   import { defineConfig } from 'astro/config';
   import llms from 'astro-llms-md';

   export default defineConfig({
     site: 'https://example.com',
     integrations: [llms({ verbose: true })]
   });
   ```

5. **Create llms.json:**
   ```json
   {
     "site_url": "https://example.com",
     "name": "Test Site",
     "description": "Testing astro-llms-md integration"
   }
   ```

6. **Run the build to test:**
   ```bash
   npm run build
   ```

## How to Contribute

### Reporting Bugs

Before creating a bug report, please:

1. Check if the issue already exists
2. Use the latest version
3. Provide detailed information:
   - Astro version
   - Node.js version
   - Integration version
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages (if any)

### Suggesting Features

Feature suggestions are welcome! Please:

1. Open an issue with the "feature request" label
2. Describe the feature and its use case
3. Explain why it would be useful

### Pull Requests

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes:**
   - Write clear, concise code
   - Follow existing code style
   - Add comments where necessary
   - Update documentation if needed

3. **Test your changes:**
   - Test with different Astro versions
   - Test with various configurations
   - Ensure TypeScript types are correct

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "type: description"
   ```

   Commit message format:
   - `feat: add new feature`
   - `fix: resolve bug`
   - `docs: update documentation`
   - `refactor: code improvement`
   - `test: add tests`
   - `chore: maintenance tasks`

5. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request:**
   - Provide a clear title and description
   - Reference any related issues
   - Explain what changes were made and why

## Project Structure

```
astro-llms-md/
├── src/
│   ├── index.js       # Main integration and generator
│   └── index.d.ts     # TypeScript definitions
├── package.json       # Package configuration
├── README.md          # Documentation
├── CONTRIBUTING.md    # This file
└── LICENSE            # MIT License
```

## Development Guidelines

### Code Style

- Use ES modules (ESM)
- Use async/await for asynchronous operations
- Use meaningful variable names
- Add JSDoc comments for functions
- Follow existing patterns in the codebase

### TypeScript

- Update `index.d.ts` when adding new options or changing interfaces
- Ensure types are accurate and descriptive
- Test types with a TypeScript project

### Testing

Currently, we test manually with sample Astro projects. To test:

1. Create a test Astro project
2. Link the integration locally
3. Add various page types (index, blog posts, about, etc.)
4. Run the build
5. Verify output files are generated correctly

Example test project structure:
```
test-project/
├── src/
│   └── pages/
│       ├── index.astro
│       ├── about.astro
│       └── blog/
│           ├── post-1.md
│           └── post-2.md
├── astro.config.mjs
├── llms.json
└── package.json
```

## Submitting Changes

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Changes are tested locally
- [ ] Documentation is updated (if needed)
- [ ] Commit messages are clear
- [ ] No unnecessary files are included

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested the changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console errors
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` (if exists)
3. Create a git tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. Publish to npm:
   ```bash
   npm publish
   ```

## Questions?

- Open an issue for questions
- Join the Astro Discord community
- Check the [Astro documentation](https://docs.astro.build)

Thank you for contributing! 🚀
