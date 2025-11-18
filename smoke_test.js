const fs = require('fs');
const log = (s) => fs.appendFileSync('smoke_results.log', s + '\n');
const base = 'http://localhost:5001';
(async () => {
  try {
    log('SMOKE TEST START');
    const tenantsRes = await (await fetch(base + '/api/tenants')).json();
    log('TENANTS: ' + JSON.stringify(tenantsRes, null, 2));
    const billsRes = await (await fetch(base + '/api/bills')).json();
    log('BILLS: ' + JSON.stringify(billsRes, null, 2));
    if (!tenantsRes || tenantsRes.length === 0) {
      log('No tenants to test');
      return;
    }
    const tenant = tenantsRes[0];
    log('Using tenant id=' + tenant.id + ' name=' + tenant.name + ' status=' + tenant.status);
    // Pause tenant
    try {
      const pauseResp = await (await fetch(base + `/api/tenants/${tenant.id}/pause`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'pause' }) })).json();
      log('PAUSE RESP: ' + JSON.stringify(pauseResp));
    } catch (e) { log('PAUSE ERROR: ' + e.message); }
    const billsAfterPause = await (await fetch(base + '/api/bills')).json();
    log('BILLS AFTER PAUSE: ' + JSON.stringify(billsAfterPause, null, 2));
    // Resume tenant
    try {
      const resumeResp = await (await fetch(base + `/api/tenants/${tenant.id}/pause`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'resume' }) })).json();
      log('RESUME RESP: ' + JSON.stringify(resumeResp));
    } catch (e) { log('RESUME ERROR: ' + e.message); }
    const billsAfterResume = await (await fetch(base + '/api/bills')).json();
    log('BILLS AFTER RESUME: ' + JSON.stringify(billsAfterResume, null, 2));
    // Mark first bill as paid if exists
    if (billsAfterResume && billsAfterResume.length > 0) {
      const bill = billsAfterResume[0];
      try {
        const paidResp = await (await fetch(base + `/api/bills/${bill.id}/status`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'paid' }) })).json();
        log('PAID RESP: ' + JSON.stringify(paidResp));
      } catch (e) { log('PAID ERROR: ' + e.message); }
      const billsFinal = await (await fetch(base + '/api/bills')).json();
      log('BILLS FINAL: ' + JSON.stringify(billsFinal, null, 2));
    }
    log('SMOKE TEST END');
  } catch (e) {
    log('SMOKE SCRIPT ERROR: ' + e.stack);
  }
})();
