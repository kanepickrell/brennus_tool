import type {
  RangeTargetField,
  RangeTargetKind,
  RangeTargetData,
} from '../types/opforRangeTarget';

/**
 * Templates for the five kinds of range targets.
 *
 * A template is what the palette drags; when dropped, WorkflowBuilder calls
 * `createRangeTargetFromTemplate` below to materialize a full RangeTargetData
 * with a fresh targetId and a default name.
 *
 * Adding fields here will NOT migrate existing targets on saved campaigns.
 * If you rename a field id, existing campaigns will lose that field's value.
 * When in doubt, add a new field with a new id rather than renaming.
 */

export interface RangeTargetTemplate {
  kind: RangeTargetKind;
  label: string;
  /** Short description shown under the palette tile. */
  description: string;
  /** Emoji badge for the card corner and palette tile. */
  icon: string;
  /**
   * Tailwind palette key used for the card border/accent. Must match the
   * branches in RangeTargetNode's `colorClasses`. Keep in the slate/blue
   * family so targets visually read as "infrastructure" vs the tactic-colored
   * opforNodes.
   */
  color: 'sky' | 'blue' | 'indigo' | 'slate' | 'cyan';
  /**
   * Default field order is preserved; the inspector renders in this order.
   * The first two non-sensitive fields are shown in the card preview.
   */
  defaultFields: RangeTargetField[];
  /** Default name prefix, suffixed with a counter when multiple are dropped. */
  defaultNamePrefix: string;
}

/**
 * Convenience category arrays. Keep in sync with what command module JSON
 * payloads reference in their parameter default values.
 *
 * If you add a new category token (e.g. 'SMB_SHARE'), add it here and to the
 * suggestsFor of the appropriate field below so the PropertiesPanel finds it.
 */
const CAT_IP = ['TARGET_IP', 'HOST_IP', 'TARGET1', 'TARGET2', 'RHOST', 'RHOSTS'];
const CAT_HOSTNAME = ['TARGET_HOSTNAME', 'HOSTNAME', 'COMPUTER_NAME'];
const CAT_USER = ['TARGET_USER', 'USERNAME', 'USER', 'SMB_USER'];
const CAT_PASS = ['TARGET_PASS', 'PASSWORD', 'PASS', 'SMB_PASS'];
const CAT_DOMAIN = ['TARGET_DOMAIN', 'DOMAIN', 'DOMAIN_NAME'];
const CAT_PORT = ['TARGET_PORT', 'PORT', 'RPORT'];
const CAT_URL = ['TARGET_URL', 'URL'];

export const RANGE_TARGET_TEMPLATES: Record<RangeTargetKind, RangeTargetTemplate> = {
  'windows-host': {
    kind: 'windows-host',
    label: 'Windows Host',
    description: 'Workstation or member server. Use for PsExec, WMI, SMB lateral movement targets.',
    icon: '🖥️',
    color: 'sky',
    defaultNamePrefix: 'WIN',
    defaultFields: [
      { id: 'ip',          label: 'IP Address',   type: 'string',   value: '', placeholder: '10.0.1.50',        suggestsFor: CAT_IP },
      { id: 'hostname',    label: 'Hostname',     type: 'string',   value: '', placeholder: 'WKS-FINANCE-01',   suggestsFor: CAT_HOSTNAME },
      { id: 'username',    label: 'Username',     type: 'string',   value: '', placeholder: 'local-admin',      suggestsFor: CAT_USER },
      { id: 'password',    label: 'Password',     type: 'password', value: '', placeholder: '••••••••',         suggestsFor: CAT_PASS, sensitive: true, emitMode: 'plain' },
      { id: 'domain',      label: 'Domain',       type: 'string',   value: '', placeholder: 'CORP',             suggestsFor: CAT_DOMAIN },
      { id: 'os_version',  label: 'OS Version',   type: 'select',   value: '', options: ['Windows 10', 'Windows 11', 'Windows Server 2019', 'Windows Server 2022'] },
    ],
  },

  'ad-domain-controller': {
    kind: 'ad-domain-controller',
    label: 'AD Domain Controller',
    description: 'Domain controller for AD enumeration, DCSync, Kerberoasting, GPP, persistence.',
    icon: '🏛️',
    color: 'indigo',
    defaultNamePrefix: 'DC',
    defaultFields: [
      { id: 'ip',            label: 'DC IP',          type: 'string',   value: '', placeholder: '10.0.0.10',       suggestsFor: CAT_IP },
      { id: 'hostname',      label: 'DC Hostname',    type: 'string',   value: '', placeholder: 'DC01',            suggestsFor: CAT_HOSTNAME },
      { id: 'domain_fqdn',   label: 'Domain FQDN',    type: 'string',   value: '', placeholder: 'corp.local',      suggestsFor: [...CAT_DOMAIN, 'DOMAIN_FQDN', 'FQDN'] },
      { id: 'netbios_name',  label: 'NetBIOS Name',   type: 'string',   value: '', placeholder: 'CORP',            suggestsFor: ['NETBIOS', 'NETBIOS_NAME', ...CAT_DOMAIN] },
      { id: 'admin_user',    label: 'Admin User',     type: 'string',   value: '', placeholder: 'Administrator',   suggestsFor: [...CAT_USER, 'DOMAIN_ADMIN', 'DA_USER'] },
      { id: 'admin_pass',    label: 'Admin Password', type: 'password', value: '', placeholder: '••••••••',        suggestsFor: [...CAT_PASS, 'DA_PASS'], sensitive: true, emitMode: 'plain' },
      { id: 'dc_role',       label: 'DC Role',        type: 'select',   value: '', options: ['PDC Emulator', 'RID Master', 'Infrastructure Master', 'Read-Only DC', 'Standard DC'] },
    ],
  },

  'network-device': {
    kind: 'network-device',
    label: 'Network Device',
    description: 'Router, switch, or firewall. Use for SNMP enumeration, pivot pinning, mgmt-plane targeting.',
    icon: '📡',
    color: 'slate',
    defaultNamePrefix: 'NET',
    defaultFields: [
      { id: 'mgmt_ip',        label: 'Management IP',  type: 'string',   value: '', placeholder: '10.0.255.1',     suggestsFor: [...CAT_IP, 'MGMT_IP'] },
      { id: 'device_type',    label: 'Device Type',    type: 'select',   value: '', options: ['Router', 'Switch', 'Firewall', 'Load Balancer', 'WAP'] },
      { id: 'vendor',         label: 'Vendor',         type: 'select',   value: '', options: ['Cisco', 'Juniper', 'Palo Alto', 'Fortinet', 'Arista', 'HPE', 'MikroTik', 'Other'] },
      { id: 'snmp_community', label: 'SNMP Community', type: 'password', value: '', placeholder: 'public',         suggestsFor: ['SNMP_COMMUNITY', 'SNMP_STRING'], sensitive: true, emitMode: 'plain' },
      { id: 'ssh_user',       label: 'SSH Username',   type: 'string',   value: '', placeholder: 'admin',          suggestsFor: CAT_USER },
      { id: 'ssh_pass',       label: 'SSH Password',   type: 'password', value: '', placeholder: '••••••••',       suggestsFor: CAT_PASS, sensitive: true, emitMode: 'plain' },
    ],
  },

  'web-server': {
    kind: 'web-server',
    label: 'Web Server',
    description: 'HTTP(S) service. Use for initial access via webshell, exploit chains, credential phishing landing.',
    icon: '🌐',
    color: 'cyan',
    defaultNamePrefix: 'WEB',
    defaultFields: [
      { id: 'ip',          label: 'IP Address',    type: 'string',   value: '', placeholder: '10.0.1.42',       suggestsFor: CAT_IP },
      { id: 'hostname',    label: 'Hostname',      type: 'string',   value: '', placeholder: 'webapp-01',       suggestsFor: CAT_HOSTNAME },
      { id: 'url',         label: 'Base URL',      type: 'string',   value: '', placeholder: 'https://app.corp.local',  suggestsFor: CAT_URL },
      { id: 'port',        label: 'Port',          type: 'number',   value: '', placeholder: '443',             suggestsFor: CAT_PORT },
      { id: 'ssh_user',    label: 'SSH/Deploy User', type: 'string', value: '', placeholder: 'deploy',          suggestsFor: CAT_USER },
      { id: 'ssh_pass',    label: 'SSH/Deploy Pass', type: 'password', value: '', placeholder: '••••••••',      suggestsFor: CAT_PASS, sensitive: true, emitMode: 'plain' },
      { id: 'stack',       label: 'Stack',         type: 'select',   value: '', options: ['Apache/PHP', 'Nginx/PHP', 'IIS/ASP.NET', 'Node.js', 'Python/Django', 'Python/Flask', 'Java/Tomcat', 'Other'] },
    ],
  },

  'mail-server': {
    kind: 'mail-server',
    label: 'Mail Server',
    description: 'Exchange or SMTP host. Use for phishing relay, OWA cred spray, GAL enumeration.',
    icon: '📬',
    color: 'blue',
    defaultNamePrefix: 'MAIL',
    defaultFields: [
      { id: 'ip',           label: 'IP Address',     type: 'string',   value: '', placeholder: '10.0.2.20',       suggestsFor: CAT_IP },
      { id: 'hostname',     label: 'Hostname',       type: 'string',   value: '', placeholder: 'mail01',          suggestsFor: CAT_HOSTNAME },
      { id: 'owa_url',      label: 'OWA URL',        type: 'string',   value: '', placeholder: 'https://mail.corp.local/owa', suggestsFor: [...CAT_URL, 'OWA_URL'] },
      { id: 'smtp_port',    label: 'SMTP Port',      type: 'number',   value: '', placeholder: '25',              suggestsFor: [...CAT_PORT, 'SMTP_PORT'] },
      { id: 'service_user', label: 'Service Account', type: 'string',  value: '', placeholder: 'svc-exchange',    suggestsFor: CAT_USER },
      { id: 'service_pass', label: 'Service Password', type: 'password', value: '', placeholder: '••••••••',      suggestsFor: CAT_PASS, sensitive: true, emitMode: 'plain' },
      { id: 'server_type',  label: 'Server Type',    type: 'select',   value: '', options: ['Exchange 2016', 'Exchange 2019', 'Exchange Online', 'Postfix', 'Sendmail', 'Other'] },
    ],
  },
};

/**
 * Deterministic id generator. Uses crypto.randomUUID when available (modern
 * browsers) and falls back to a timestamp+random composite. Either way the
 * output is stable across rerenders because we only call it on creation.
 */
function generateTargetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `target_${crypto.randomUUID()}`;
  }
  return `target_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a fresh RangeTargetData from a template.
 *
 * @param kind  Which template to instantiate.
 * @param existingNames  Names already on the canvas; used to pick a unique
 *                      default (WIN-01, WIN-02, ...). Pass an empty Set if
 *                      you don't care about collisions.
 */
export function createRangeTargetFromTemplate(
  kind: RangeTargetKind,
  existingNames: Set<string>,
): RangeTargetData {
  const template = RANGE_TARGET_TEMPLATES[kind];
  if (!template) {
    throw new Error(`Unknown RangeTargetKind: ${kind}`);
  }

  // Pick first available "PREFIX-NN" name.
  let counter = 1;
  let name = '';
  // Safety cap so we don't spin forever if something's off.
  while (counter < 1000) {
    const candidate = `${template.defaultNamePrefix}-${String(counter).padStart(2, '0')}`;
    if (!existingNames.has(candidate)) {
      name = candidate;
      break;
    }
    counter += 1;
  }
  if (!name) {
    name = `${template.defaultNamePrefix}-${Date.now().toString(36)}`;
  }

  // Deep-clone default fields so every target has its own state.
  const fields: Record<string, RangeTargetField> = {};
  for (const f of template.defaultFields) {
    fields[f.id] = {
      ...f,
      options: f.options ? [...f.options] : undefined,
      suggestsFor: f.suggestsFor ? [...f.suggestsFor] : undefined,
    };
  }

  return {
    targetId: generateTargetId(),
    kind,
    name,
    icon: template.icon,
    fields,
  };
}

/**
 * Slugs the operator-assigned name into an uppercase identifier safe for
 * Robot Framework variable names. "WIN-DC01" -> "WIN_DC01", "app 02" -> "APP_02".
 *
 * Exported because both the generator and the PropertiesPanel need to
 * produce the same variable name for a given target, so they can agree on
 * what `${TARGET_..._IP}` resolves to.
 */
export function slugTargetName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Computes the Robot variable name for a target field:
 *   slugTargetName(target.name) -> "WIN_DC01"
 *   field.id.toUpperCase()      -> "IP"
 *   result                      -> "TARGET_WIN_DC01_IP"
 *
 * Both the emission site (robotScriptGenerator) and the resolution site
 * (variableResolution) must use this function. Do not inline the template.
 */
export function targetFieldVariableName(targetName: string, fieldId: string): string {
  return `TARGET_${slugTargetName(targetName)}_${fieldId.toUpperCase()}`;
}

/**
 * Returns the Robot-syntax reference string for a given target field, taking
 * the field's emitMode into account for sensitive fields.
 *
 *   plain  -> `${TARGET_WIN_DC01_PASSWORD}`
 *   env    -> `%{TARGET_WIN_DC01_PASSWORD}`
 *
 * Non-sensitive fields always use plain regardless of emitMode (since there's
 * no reason to pull a hostname from env).
 */
export function targetFieldReference(
  targetName: string,
  field: RangeTargetField,
): string {
  const varName = targetFieldVariableName(targetName, field.id);
  if (field.sensitive && field.emitMode === 'env') {
    return `%{${varName}}`;
  }
  return `\${${varName}}`;
}