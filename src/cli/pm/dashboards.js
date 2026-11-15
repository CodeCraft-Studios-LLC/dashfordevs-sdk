// Dashboard types a site can be set up as. HIPAA types turn on HIPAA safeguards automatically.
export const DASHBOARDS = [
  { value: "ecommerce-standard", label: "Ecommerce Standard", hint: "online store", hipaa: false },
  { value: "ecommerce-medical", label: "Ecommerce Medical", hint: "store selling medical products", hipaa: true },
  { value: "landing-page", label: "Landing Page", hint: "marketing site, forms", hipaa: false },
  { value: "telehealth", label: "Telehealth", hint: "patients, visits, prescriptions", hipaa: true },
];

export const dashboardByValue = (v) => DASHBOARDS.find((d) => d.value === v);
