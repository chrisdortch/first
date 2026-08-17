# Release and Data Authority Boundaries

The following remain unauthorized unless the owner separately approves the exact action:

- reading or exporting production records;
- connecting CI to a production or shared preview database;
- creating, deleting, or restoring provider databases or branches;
- applying a production schema migration;
- running production backfills or cleanup statements;
- changing retention or deletion policies;
- changing database credentials or Vercel environment variables;
- merging the candidate;
- promoting a deployment;
- changing a domain or DNS record;
- sending external messages;
- making a purchase.

The reusable v1 workflow accepts only its local PostgreSQL service URL. A passing receipt sets `productionEligible` to `false` and `releaseState` to `not-authorized`.
