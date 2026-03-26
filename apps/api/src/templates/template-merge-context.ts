/**
 * Builds Handlebars merge context from a contact plus optional per-send overrides.
 * Overrides do not persist to the database; they only affect rendering for this request.
 */
export type ContactForTemplate = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  domain: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  verificationStatus: string | null;
  extraFields: unknown;
};

export function mergeTemplateContext(
  contact: ContactForTemplate,
  variableOverrides?: Record<string, string> | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...contact,
    first_name: contact.firstName ?? '',
    last_name: contact.lastName ?? '',
    job_title: contact.jobTitle ?? '',
    phone_number: contact.phoneNumber ?? '',
    verification_status: contact.verificationStatus ?? '',
    email: contact.email,
    company: contact.company ?? '',
    domain: contact.domain ?? '',
  };

  if (typeof contact.extraFields === 'object' && contact.extraFields) {
    Object.assign(base, contact.extraFields as object);
  }

  if (!variableOverrides || !Object.keys(variableOverrides).length) {
    return base;
  }

  for (const [key, val] of Object.entries(variableOverrides)) {
    if (val === undefined) continue;
    base[key] = val;
  }

  if (variableOverrides.first_name !== undefined) base.firstName = variableOverrides.first_name;
  if (variableOverrides.last_name !== undefined) base.lastName = variableOverrides.last_name;
  if (variableOverrides.job_title !== undefined) base.jobTitle = variableOverrides.job_title;

  return base;
}
