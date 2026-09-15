DO $$
DECLARE
  value text;
  values text[] := ARRAY[
    'fortigate_update_interface_allowaccess',
    'fortigate_delete_interface',
    'fortigate_show_zones',
    'fortigate_update_zone',
    'fortigate_delete_zone',
    'fortigate_show_address_objects',
    'fortigate_delete_address_object',
    'fortigate_delete_service_object',
    'fortigate_delete_policy',
    'fortigate_show_vips',
    'fortigate_update_vip',
    'fortigate_delete_vip',
    'fortigate_show_ippools',
    'fortigate_create_ippool',
    'fortigate_update_ippool',
    'fortigate_delete_ippool',
    'fortigate_show_routes',
    'fortigate_update_static_route',
    'fortigate_delete_static_route',
    'fortigate_update_dns',
    'fortigate_update_ntp',
    'fortigate_show_ipsec_vpns',
    'fortigate_create_ipsec_tunnel',
    'fortigate_update_ipsec_phase1',
    'fortigate_update_ipsec_phase2',
    'fortigate_disable_ipsec_tunnel',
    'fortigate_delete_ipsec_tunnel',
    'fortigate_show_ssl_vpn',
    'fortigate_create_ssl_vpn_portal',
    'fortigate_update_ssl_vpn_settings',
    'fortigate_bind_ssl_vpn_user_group',
    'fortigate_disable_ssl_vpn',
    'fortigate_show_admins',
    'fortigate_create_admin',
    'fortigate_update_admin_trusthost',
    'fortigate_disable_admin',
    'fortigate_delete_admin',
    'fortigate_create_api_user',
    'fortigate_update_management_access',
    'fortigate_show_vdoms',
    'fortigate_create_vdom',
    'fortigate_update_vdom',
    'fortigate_move_interface_to_vdom',
    'fortigate_delete_vdom',
    'fortigate_show_ha_status',
    'fortigate_ha_precheck',
    'fortigate_configure_ha',
    'fortigate_update_ha_priority',
    'fortigate_show_sdwan_status',
    'fortigate_create_sdwan_zone',
    'fortigate_add_sdwan_member',
    'fortigate_create_sdwan_health_check',
    'fortigate_create_sdwan_rule'
  ];
BEGIN
  FOREACH value IN ARRAY values LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = value AND enumtypid = '"ActionType"'::regtype) THEN
      EXECUTE format('ALTER TYPE "ActionType" ADD VALUE %L', value);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = value AND enumtypid = '"AiIntentType"'::regtype) THEN
      EXECUTE format('ALTER TYPE "AiIntentType" ADD VALUE %L', value);
    END IF;
  END LOOP;
END $$;
