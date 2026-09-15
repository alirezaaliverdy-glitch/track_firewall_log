ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'linux_list_open_ports';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'linux_check_firewall_status';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'linux_block_ip';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_list_management_services';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_check_login_logs';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'mikrotik_block_ip';

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'linux_list_open_ports';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'linux_check_firewall_status';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'linux_block_ip';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_list_management_services';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_check_login_logs';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'mikrotik_block_ip';
