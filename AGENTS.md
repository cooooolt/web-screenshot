# Commit Convention (Conventional Commits 1.0.0)

## Format
`<type>[optional scope]: <description>`

## Types
- `feat` - new feature
- `fix` - bug fix
- `docs` - documentation only
- `style` - formatting, semicolons, etc
- `refactor` - code change neither fix nor feat
- `perf` - performance improvement
- `test` - add/correct tests
- `chore` - build process, tools

## Rules
- type: lowercase
- scope: optional, lowercase, wrapped in ()
- description: lowercase start, no period
- breaking change: footer `BREAKING CHANGE: ...`

## Examples
```
feat: add avif output support
fix: resolve screenshot timeout issue
docs: update format documentation
refactor: simplify buffer handling
```
