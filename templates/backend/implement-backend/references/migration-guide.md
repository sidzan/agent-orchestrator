<!-- EDIT-ME -->
<!--
  This is a starter document derived from a Flyway + multi-region SQL Server backend.
  Replace with your project's conventions. The orchestrator references this file —
  keep the path stable, change the contents.
-->

# Database Migration Guide

## Overview

{{CONFIG.project.name}} uses **Flyway** for versioned SQL migrations. Migrations are plain SQL scripts executed in order against multiple databases.

## Naming Convention

```
V{major}.{minor}__{PascalCase_Description}.sql
```

- Double underscore `__` separates version from description
- PascalCase with underscores for multi-word descriptions
- Example: `V181.0__Create_Salary_Table.sql`

## Version Numbering

- Check the latest version with: `ls src/YourOrg.Service.Infrastructure/Data/Migrations/ | sort -t'V' -k2 -n | tail -5`
- Current latest is around V180.x (verify with explorer report)
- Each new feature group increments the major version: next is V{latest_major + 1}.0
- Steps within a feature increment the minor version: .0, .1, .2, .3

## Target Databases

Migrations run against 5 databases. The `{envName}` placeholder is replaced by the `flyway-prepare-migrations.sh` script at deployment time.

| Database | USE statement | Countries |
|---|---|---|
| Hub | `USE [YourOrg_{envName}]` | Shared/cross-country data |
| Norway | `USE [<DB_PREFIX>_{envName}]` | NO |
| Denmark | `USE [<DB_PREFIX>_DK_{envName}]` | DK |
| Finland | `USE [<DB_PREFIX>_FI_{envName}]` | FI |
| Sweden | `USE [<DB_PREFIX>_SE_{envName}]` | SE |

Most entity migrations target all 4 country databases (NO, DK, FI, SE). Hub-only migrations are rare.

## Standard Migration Sequence for New Entity

For a new entity, create these migration files in order:

| Step | File | Description |
|---|---|---|
| .0 | `V{ver}.0__Create_{Entity}_Table.sql` | CREATE TABLE across 4 country DBs |
| .1 | `V{ver}.1__Create_{Entity}_View.sql` | CREATE VIEW joining to hub/related tables |
| .2 | `V{ver}.2__Create_{Entity}_InsertTrigger.sql` | INSTEAD OF INSERT trigger on view |
| .3 | `V{ver}.3__Create_{Entity}_UpdateTrigger.sql` | INSTEAD OF UPDATE trigger on view |

Not all steps are always needed:
- Read-only entities without views: only .0
- Entities with views but no write operations: .0 and .1
- Full CRUD entities: all four steps

## Templates

SQL templates are in `.claude/skills/implement-backend/assets/`:

| Template | Purpose |
|---|---|
| `create-table.sql` | Table creation across 4 country DBs |
| `create-view.sql` | View creation with JOIN patterns |
| `create-insert-trigger.sql` | INSTEAD OF INSERT trigger |
| `create-update-trigger.sql` | INSTEAD OF UPDATE trigger |

### How to Use Templates

1. Copy the template content
2. Replace all `{{PLACEHOLDER}}` values:
   - `{{TABLE_NAME}}` -- legacy table name (e.g., `Salary`)
   - `{{TABLE_ID}}` -- primary key column name (e.g., `SalaryID`)
   - `{{COLUMNS}}` -- entity-specific columns
   - `{{FK_CONSTRAINTS}}` -- foreign key constraints (if any)
   - `{{INDEXES}}` -- additional indexes (if any)
   - `{{VIEW_NAME}}` -- view name, typically `v2_{EntityName}` (e.g., `v2_Salary`)
   - `{{VIEW_COLUMNS}}` -- SELECT columns for the view
   - `{{JOIN_CLAUSES}}` -- JOIN statements for related tables

## Standard Table Columns

Every entity table includes these standard columns:

```sql
[{Entity}ID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
[Systemv2ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() UNIQUE,
-- entity-specific columns go here --
[Status] INT NULL,
[RegisteredDate] DATETIME2 NULL,
[LastModified] DATETIME2 NULL,
[InsertedBy] NVARCHAR(50) NULL,
[UpdatedBy] NVARCHAR(50) NULL
```

- `{Entity}ID`: Auto-increment PK used internally (never exposed to API)
- `Systemv2ID`: GUID exposed as `Id` in domain entities and API
- `Status`: Soft-delete / state flag
- Audit columns: `RegisteredDate`, `LastModified`, `InsertedBy`, `UpdatedBy`

## Foreign Key Patterns

### In Tables
FKs use the INT identity column:
```sql
[EmployeeID] INT NOT NULL,
CONSTRAINT [FK_{Entity}_Employee] FOREIGN KEY ([EmployeeID]) REFERENCES [dbo].[Employee]([EmployeeID])
```

### In Views
Views expose FKs as `Systemv2ID` values via JOINs:
```sql
SELECT
    t.[Systemv2ID] AS [Id],
    e.[Systemv2ID] AS [EmployeeId],
    -- other columns
FROM [dbo].[{Entity}] t
INNER JOIN [dbo].[Employee] e ON t.[EmployeeID] = e.[EmployeeID]
```

### In Triggers
Triggers resolve `Systemv2ID` back to INT IDs via subqueries:
```sql
INSERT INTO [dbo].[{Entity}] ([EmployeeID], ...)
SELECT
    (SELECT [EmployeeID] FROM [dbo].[Employee] WHERE [Systemv2ID] = i.[EmployeeId]),
    ...
FROM inserted i
```

## Examples

### Simple Entity (no FKs) -- Channel
```sql
-- Table
CREATE TABLE [dbo].[Channel] (
    [ChannelID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [Systemv2ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() UNIQUE,
    [Name] NVARCHAR(255) NULL,
    [Status] INT NULL,
    [RegisteredDate] DATETIME2 NULL,
    [LastModified] DATETIME2 NULL,
    [InsertedBy] NVARCHAR(50) NULL,
    [UpdatedBy] NVARCHAR(50) NULL
);
```

### Entity with FKs -- EmployeeChannel
```sql
-- Table
CREATE TABLE [dbo].[EmployeeChannel] (
    [EmployeeChannelID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [Systemv2ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() UNIQUE,
    [EmployeeID] INT NOT NULL,
    [ChannelID] INT NOT NULL,
    [Status] INT NULL,
    [RegisteredDate] DATETIME2 NULL,
    [LastModified] DATETIME2 NULL,
    [InsertedBy] NVARCHAR(50) NULL,
    [UpdatedBy] NVARCHAR(50) NULL,
    CONSTRAINT [FK_EmployeeChannel_Employee] FOREIGN KEY ([EmployeeID]) REFERENCES [dbo].[Employee]([EmployeeID]),
    CONSTRAINT [FK_EmployeeChannel_Channel] FOREIGN KEY ([ChannelID]) REFERENCES [dbo].[Channel]([ChannelID])
);

-- View
CREATE VIEW [dbo].[v2_EmployeeChannel] AS
SELECT
    ec.[Systemv2ID] AS [Id],
    e.[Systemv2ID] AS [EmployeeId],
    c.[Systemv2ID] AS [ChannelId],
    ec.[Status],
    ec.[RegisteredDate],
    ec.[LastModified],
    ec.[InsertedBy],
    ec.[UpdatedBy]
FROM [dbo].[EmployeeChannel] ec
INNER JOIN [dbo].[Employee] e ON ec.[EmployeeID] = e.[EmployeeID]
INNER JOIN [dbo].[Channel] c ON ec.[ChannelID] = c.[ChannelID];
```

## Environment Substitution

The `{envName}` placeholder in `USE` statements is NOT a template placeholder you fill in. It is replaced automatically by `flyway-prepare-migrations.sh` at deployment time. Always write `{envName}` literally in migration scripts.

## Migration File Location

All migration files go in:
```
src/YourOrg.Service.Infrastructure/Data/Migrations/
```
