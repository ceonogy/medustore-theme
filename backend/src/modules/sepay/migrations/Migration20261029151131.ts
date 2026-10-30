import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261029151131 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "sepay_webhook_event" drop constraint if exists "sepay_webhook_event_sepay_transaction_id_unique";`);
    this.addSql(`create table if not exists "sepay_webhook_event" ("id" text not null, "sepay_transaction_id" text not null, "gateway" text null, "account_number" text null, "sub_account" text null, "code" text null, "transfer_type" text null, "transfer_amount" numeric null, "content" text null, "status" text not null default 'processed', "session_id" text null, "order_id" text null, "payload" jsonb not null, "raw_transfer_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sepay_webhook_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sepay_webhook_event_sepay_transaction_id_unique" ON "sepay_webhook_event" ("sepay_transaction_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sepay_webhook_event_deleted_at" ON "sepay_webhook_event" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "sepay_webhook_event" cascade;`);
  }

}
