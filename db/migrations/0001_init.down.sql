-- Reverses 0001_init. Destroys every record; only ever run on staging or a throwaway branch.
drop schema audit cascade;
drop table meta;
drop table documents;
drop table tenants;
