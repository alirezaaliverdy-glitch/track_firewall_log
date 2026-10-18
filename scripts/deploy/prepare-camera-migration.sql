-- Run with psql as the AppUser owner or a database administrator before deploying
-- to a legacy database whose API role does not already own AppUser.
-- Supply the existing API role with: psql ... -v api_role=firewall_app -f this-file
-- This grants only permission to reference the user ID. It changes no rows,
-- table ownership, runtime read/write privileges, or PostgreSQL role membership.
\set ON_ERROR_STOP on
SELECT format('GRANT REFERENCES (id) ON TABLE public.%I TO %I', 'AppUser', :'api_role')
WHERE NOT has_column_privilege(:'api_role', format('public.%I', 'AppUser'), 'id', 'REFERENCES')
\gexec
-- Company is an older owner-managed table. New camera company bindings need
-- only REFERENCES(id), never ownership or broader write privileges.
SELECT format('GRANT REFERENCES (id) ON TABLE public.%I TO %I', 'Company', :'api_role')
WHERE NOT has_column_privilege(:'api_role', format('public.%I', 'Company'), 'id', 'REFERENCES')
\gexec
