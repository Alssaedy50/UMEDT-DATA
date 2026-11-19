# Permanent public content deletion

Public deletion removes a record from the current UMEDT-DATA master collection and prevents the record ID from being republished accidentally.

## Run a deletion

1. Open **Actions → Admin — permanently delete public UMEDT content**.
2. Select the exact collection (domain).
3. Enter the exact, case-sensitive record ID.
4. Enter a reason of 8–500 characters.
5. Enter the confirmation phrase `DELETE-PUBLIC-CONTENT` and run the workflow.

The workflow is restricted to the repository owner and the `main` branch. It validates both signed release channels before committing any deletion. It refuses to delete a record while another master record still references its ID or, for media, its file path/URL/name. Remove or relink dependent records first.

## Supported domains

`terms`, `sentences`, `topics`, `customAffixes`, `customAbbreviations`, `blocks`, `subjects`, `books`, `questions`, `exams`, and `mediaAssets`.

## What happens

- The target record is removed from its master JSON file.
- An append-only entry is added to `data/master/public-deletions.json` with domain, ID, timestamp, reason and a SHA-256 digest of the removed record.
- For a media asset, its unreferenced binary file is removed from the current repository tree.
- Superseded stable/beta ZIP packages and matching GitHub Release ZIP assets are removed.
- New signed stable and beta packages are built and published.
- The app consumes signed tombstones, removes matching cached public records, and retains the tombstone registry so an older package cannot restore the same ID.

## Important limits

This removes current published repository files and release assets. It cannot erase Git history, forks, third-party backups, screenshots, or files users already downloaded. A user who is offline and has an old package can still possess that copy; once the app receives a current signed release, it removes the matching cached records and blocks replay of the old package.
