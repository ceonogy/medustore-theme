import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030220649 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "goship_shipment_event" drop constraint if exists "goship_shipment_event_gcode_status_update_time_unique";`);
    this.addSql(`alter table if exists "goship_setting" drop constraint if exists "goship_setting_key_unique";`);
    this.addSql(`create table if not exists "goship_setting" ("id" text not null, "key" text not null, "value" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "goship_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_goship_setting_key_unique" ON "goship_setting" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goship_setting_deleted_at" ON "goship_setting" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "goship_shipment_event" ("id" text not null, "gcode" text not null, "carrier_code" text null, "order_id" text null, "fulfillment_id" text null, "status" text not null, "status_text" text null, "description" text null, "tracking_url" text null, "carrier_short_name" text null, "is_return" boolean not null default false, "is_lost" boolean not null default false, "cod" integer null, "fee" integer null, "update_time" integer null, "payload" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "goship_shipment_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goship_shipment_event_deleted_at" ON "goship_shipment_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_goship_shipment_event_gcode_status_update_time_unique" ON "goship_shipment_event" ("gcode", "status", "update_time") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goship_shipment_event_gcode" ON "goship_shipment_event" ("gcode") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_goship_shipment_event_order_id" ON "goship_shipment_event" ("order_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "goship_setting" cascade;`);

    this.addSql(`drop table if exists "goship_shipment_event" cascade;`);
  }

}
