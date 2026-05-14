-- Initial board rate
insert into board_rates(gold_22k, gold_24k, gold_18k, silver, silver_pure, effective_date)
values (7200, 7800, 5850, 95, 100, current_date);

-- Default expense categories
insert into expense_categories(name) values
  ('Rent'), ('Electricity'), ('Staff Salary'), ('Transport'),
  ('Maintenance'), ('Miscellaneous');

-- To set up admin profile + gamified credentials after first login:
-- update profiles set
--   role = 'admin',
--   secret_number = '1234',
--   login_pattern = '[{"gun":1,"target":5},{"gun":2,"target":3}]'
-- where id = '<your-user-uuid>';
