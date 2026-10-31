import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030090614 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "goship_location" drop constraint if exists "goship_location_level_code_unique";`);
    this.addSql(`create table if not exists "goship_location" ("id" text not null, "level" text not null, "code" text not null, "name" text not null, "parent_code" text null, "support_carriers" jsonb null, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "goship_location_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goship_location_deleted_at" ON "goship_location" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_goship_location_level_code_unique" ON "goship_location" ("level", "code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goship_location_level_parent_code" ON "goship_location" ("level", "parent_code") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "goship_location" cascade;`);
  }

}
