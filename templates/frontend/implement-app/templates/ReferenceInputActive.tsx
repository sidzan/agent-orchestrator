/**
 * Pattern: ReferenceInput with isActive filter
 *
 * IMPORTANT: This is a PATTERN GUIDE, not a copy-paste file.
 * Apply this pattern wherever you use ReferenceInput in forms.
 *
 * Rule: ALL ReferenceInput dropdowns MUST include:
 *   - isActive_eq: true   (auto-filters inactive entities)
 *   - operationCountry_eq (prevents 403)
 *
 * Example usage in a form:
 */
import { ReferenceInput, SelectInput } from 'react-admin';
import { getActiveCountryCode } from '@yourorg/shared/domain';

// PATTERN — copy and adapt:
const Example = () => {
  const operationCountry = getActiveCountryCode();

  return (
    <ReferenceInput
      source="<foreignKeyField>"
      reference="<ResourceName>"
      filter={{
        isActive_eq: true,              // ALWAYS — filters inactive entities
        operationCountry_eq: operationCountry,  // ALWAYS — prevents 403
      }}
    >
      <SelectInput optionText="<labelField>" />
    </ReferenceInput>
  );
};

/**
 * Note: getActiveCountryCode() must be called INSIDE the component (not at module level)
 * because it reads from a context that's only available during render.
 */
