export default {
  id: 'warehouse',
  purpose: 'Warehouse is operational stock keeping: items with barcodes, warehouses and bins, receipts, issues, transfers, write-offs, tools by instance, inventory from a phone. It is not bookkeeping: data is exported to the accounting system.',
  audience: 'Storekeepers, foremen, supply and accounting.',
  setup: [
    {
      title: 'Switch the module on',
      text: 'It is off by default; write-offs are approved through Approvals.',
    },
    {
      title: 'Warehouses and keepers',
      text: 'Create warehouses, assign the responsible keepers and, if needed, bins.',
    },
    {
      title: 'Items',
      text: 'Import from Excel or create by hand: units, packs, barcodes, minimum stock.',
    },
    {
      title: 'Currency and thresholds',
      text: 'Base currency, rates and the write-off approval threshold — in the [settings](/admin/settings/warehouse).',
    },
    {
      title: 'Links',
      text: 'With Procurement receipts follow requests; with Masterplan issues go to objects.',
    },
  ],
  roles: {
    'warehouse.view': 'View stock on every warehouse.',
    'warehouse.request': 'Issue requests.',
    'warehouse.operate': 'Post documents (receipt, issue, transfer).',
    'warehouse.writeoff': 'Write-offs.',
    'warehouse.inventory': 'Inventory sessions.',
    'warehouse.cost': 'See amounts and cost; without it money is hidden.',
    'warehouse.backdate': 'Backdated documents.',
    'warehouse.admin': 'Settings, directories and everything else.',
  },
  access: 'Rights are global (a permission) or per warehouse (an assignment); a warehouse’s keeper has rights on it.',
  scenarios: [
    {
      title: 'Receipt from a request',
      text: 'A delivery for an approved purchase request: the storekeeper scans goods and posts the receipt from a phone.',
    },
    {
      title: 'Tools to a site',
      text: 'A drill is issued to a foreman with a return date; overdue returns show in a widget and notifications.',
    },
  ],
  faq: [
    {
      q: 'Can stock go negative?',
      a: 'No, a document without enough stock is refused.',
    },
    {
      q: 'How does data reach accounting?',
      a: 'Through CSV exports and the API.',
    },
  ],
};
