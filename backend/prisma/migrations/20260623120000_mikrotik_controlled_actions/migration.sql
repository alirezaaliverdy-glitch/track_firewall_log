ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_add_address_list_entry';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_remove_address_list_entry';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_block_ip_temporary';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_create_managed_drop_rule';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_enable_managed_rule';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_disable_managed_rule';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_add_comment_to_rule';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_read_firewall_summary';

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_add_address_list_entry';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_remove_address_list_entry';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_block_ip_temporary';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_create_managed_drop_rule';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_enable_managed_rule';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_disable_managed_rule';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_add_comment_to_rule';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_read_firewall_summary';
