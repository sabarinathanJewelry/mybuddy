-- Migration 111: Change KPI target from sales amount to weight in grams
alter table kpi_targets
  rename column sales_target to weight_target;

alter table kpi_targets
  alter column weight_target type numeric(10,3);
