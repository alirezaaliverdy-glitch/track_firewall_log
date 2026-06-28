ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'fortigate_create_static_route';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'fortigate_list_interfaces';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'fortigate_list_policies';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'fortigate_list_address_objects';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'fortigate_list_routes';

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'fortigate_create_static_route';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'fortigate_list_interfaces';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'fortigate_list_policies';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'fortigate_list_address_objects';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'fortigate_list_routes';
