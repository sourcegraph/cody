-- divide price and gst by 10
select audit_open('COM-1351-luke');
update products.fee
set gst = /* CURSOR */
where last_updated_by = 'COM-1351';
