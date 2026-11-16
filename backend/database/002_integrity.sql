-- Guard financial values even when a local maintenance script bypasses the API.
CREATE TRIGGER bills_nonnegative_insert BEFORE INSERT ON bills
WHEN NEW.amount < 0 OR typeof(NEW.amount) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'Invalid bill amount'); END;
CREATE TRIGGER bills_nonnegative_update BEFORE UPDATE OF amount ON bills
WHEN NEW.amount < 0 OR typeof(NEW.amount) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'Invalid bill amount'); END;
CREATE TRIGGER payment_positive_insert BEFORE INSERT ON payment_history
WHEN NEW.amount_paid <= 0 OR typeof(NEW.amount_paid) NOT IN ('integer','real') OR NEW.payment_type NOT IN ('RENT','UTILITY')
BEGIN SELECT RAISE(ABORT, 'Invalid payment'); END;
CREATE TRIGGER payment_positive_update BEFORE UPDATE ON payment_history
WHEN NEW.amount_paid <= 0 OR typeof(NEW.amount_paid) NOT IN ('integer','real') OR NEW.payment_type NOT IN ('RENT','UTILITY')
BEGIN SELECT RAISE(ABORT, 'Invalid payment'); END;
CREATE TRIGGER apartment_nonnegative_insert BEFORE INSERT ON apartments
WHEN NEW.rent_amount < 0 OR typeof(NEW.rent_amount) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'Invalid rent'); END;
CREATE TRIGGER apartment_nonnegative_update BEFORE UPDATE OF rent_amount ON apartments
WHEN NEW.rent_amount < 0 OR typeof(NEW.rent_amount) NOT IN ('integer','real')
BEGIN SELECT RAISE(ABORT, 'Invalid rent'); END;
CREATE TRIGGER settings_nonnegative_update BEFORE UPDATE ON settings
WHEN NEW.electricity_rate < 0 OR NEW.water_rate < 0
BEGIN SELECT RAISE(ABORT, 'Invalid utility rate'); END;
