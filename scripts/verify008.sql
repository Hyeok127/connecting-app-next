select proname, pronargs, pg_get_function_identity_arguments(oid) as args
from pg_proc
where proname in ('run_batch_matching', 'run_batch_matching_locked')
order by proname, pronargs;
