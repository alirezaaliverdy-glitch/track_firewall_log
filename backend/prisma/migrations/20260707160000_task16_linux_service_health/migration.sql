ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'linux_list_running_services';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'linux_list_failed_services';
ALTER TYPE "AiIntentType" ADD VALUE IF NOT EXISTS 'linux_check_important_services';

ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'linux_list_running_services';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'linux_list_failed_services';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'linux_check_important_services';
