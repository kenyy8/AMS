import buildTenantBillsPayload from '../qrPayload';

describe('buildTenantBillsPayload', () => {
  test('calculates totals and date range correctly', () => {
    const tenant = { id: 42, name: 'Alice', apartment_number: 'B-12', contact: 'alice@example.com' };
    const bills = [
      { id: 1, bill_type: 'Rent', amount: '1000', due_date: '2025-10-01' },
      { id: 2, bill_type: 'Water', amount: '30', due_date: '2025-10-05' },
      { id: 3, bill_type: 'Electricity', amount: '50', due_date: '2025-10-03' }
    ];

  const payload = buildTenantBillsPayload(tenant, bills);

    expect(payload.type).toBe('tenant_bills');
    expect(payload.tenant_id).toBe(42);
    expect(payload.tenant_name).toBe('Alice');
    expect(payload.totals.rent).toBe(1000);
    expect(payload.totals.water).toBe(30);
    expect(payload.totals.electricity).toBe(50);
    expect(payload.totals.total).toBe(1080);
    expect(payload.date_range.start).toBe('2025-10-01T00:00:00.000Z');
    expect(payload.date_range.end).toBe('2025-10-05T00:00:00.000Z');
    expect(payload.bills).toHaveLength(3);
  });
});
