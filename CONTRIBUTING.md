# Contributing to Complaint Portal

Thank you for your interest in contributing! This guide helps you get started.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your feature
4. **Make changes** and commit with clear messages
5. **Push to GitHub** and create a Pull Request

## Development Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your API keys if needed
# RESEND_API_KEY, GEMINI_API_KEY, etc.

# Start dev server
npm run dev
```

## Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Run `npm run lint` before committing
- Format code with consistent indentation

## Commit Messages

Use clear, descriptive commit messages:
```
✨ feat: Add email OTP delivery
🐛 fix: Resolve complaint routing issue
📝 docs: Update README with setup steps
🎨 style: Format component styling
♻️  refactor: Simplify API response handling
🧪 test: Add complaint validation tests
```

## Making Changes

### Frontend (React)
- Components in `src/components/`
- Styles in `src/index.css` or component files
- Types in `src/types.ts` or `shared/types.ts`

### Backend (Express)
- Routes in `server.ts`
- API endpoints should return `{ data: ... }` or `{ error: ... }`
- Add validation for all inputs

### Shared Code
- Types in `shared/types.ts`
- Utilities in `shared/municipalities.ts`

## Testing

Before submitting PR:
```bash
# Type check
npm run lint

# Test locally
npm run dev

# Verify:
# - [ ] Citizen portal works
# - [ ] Admin dashboard works
# - [ ] Block portals work
# - [ ] OTP delivery works (if modified)
# - [ ] No console errors
```

## Pull Request Process

1. **Describe your changes** in the PR title and description
2. **Link related issues** (if any)
3. **Include testing notes** - how to test your changes
4. **Wait for review** - maintainers will provide feedback
5. **Address feedback** - push additional commits as needed
6. **Merge** - maintainers will merge once approved

## PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Performance improvement

## How to Test
Steps to verify the changes work

## Checklist
- [ ] Code follows project style
- [ ] `npm run lint` passes
- [ ] Tested locally
- [ ] No breaking changes
- [ ] Documentation updated (if needed)
```

## Areas to Contribute

- **Frontend**: Improve UI/UX, add accessibility
- **Backend**: Optimize APIs, add validation
- **Documentation**: Update README, add examples
- **Testing**: Add automated tests
- **Deployment**: Improve CI/CD setup

## Questions?

- Check existing issues and discussions
- Open a GitHub issue for questions
- Comment on related PRs

## Code of Conduct

- Be respectful and inclusive
- Assume good intent
- Welcome diverse perspectives
- Focus on constructive feedback

Thank you for contributing! 🎉
