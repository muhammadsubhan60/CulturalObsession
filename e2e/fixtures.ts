export const E2E = {
  productSlug: 'e2e-name-pendant',
  productTitle: 'E2E Name Pendant',
  staffEmail: 'e2e-staff@test.local',
  // Test-only account that exists solely in local/CI databases.
  staffPassword: 'e2e-staff-password-0001',
};

/** A different +92 number per run so the per-phone customer record stays readable. */
export function testPhone() {
  return `0300${String(Date.now()).slice(-7)}`;
}
