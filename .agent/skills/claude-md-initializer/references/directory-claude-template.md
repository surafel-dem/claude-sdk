# Directory CLAUDE.md Template

Use this template for directory-level CLAUDE.md files (e.g., `frontend/CLAUDE.md`, `backend/CLAUDE.md`):

```md
# [Directory Name] Context

- **Tech**: [Framework, language, key libraries used in this directory]
- **Purpose**: [What this directory is responsible for]

## Conventions

### [Category 1, e.g., "File Organization"]
- [Convention 1]
- [Convention 2]

### [Category 2, e.g., "Naming"]
- [Convention 1]
- [Convention 2]

### [Category 3, e.g., "Patterns"]
- [Pattern description]

## Key Files

| File | Purpose |
|------|---------|
| `[file1]` | [What it does] |
| `[file2]` | [What it does] |
| `[file3]` | [What it does] |

## Common Tasks

### [Task 1, e.g., "Adding a new page"]
1. [Step 1]
2. [Step 2]
3. [Step 3]

### [Task 2, e.g., "Creating a new component"]
1. [Step 1]
2. [Step 2]

## Where to Look

- For [X]: see `[relative path]`
- For [Y]: see `[relative path]`
- For shared utilities: see `[path to related directory]`

## Related CLAUDE Files

- `../[related-directory]/CLAUDE.md` – [when to reference it]
```

## Customization by Directory Type

### Frontend Directory

Focus on:

- Component patterns (server vs client components)
- Routing conventions
- State management approach
- Styling patterns
- Data fetching patterns

### Backend Directory

Focus on:

- API endpoint patterns
- Authentication/authorization
- Error handling conventions
- Database access patterns
- Middleware usage

### Components Directory

Focus on:

- Component API conventions (props, events)
- Design system patterns
- Accessibility requirements
- Testing patterns

### Database Directory

Focus on:

- Schema conventions
- Migration patterns
- Seeding approach
- Query patterns
- Constraints and validations

## Notes

- Keep each directory CLAUDE.md **< 200 lines**
- Focus on **local patterns** specific to this directory
- Use **pointers to files** rather than inline code examples
- Update when patterns evolve, then refactor code to match
