'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('CURRENT BEHAVIOUR: checkout resolves GST from HSN and taxes the discounted taxable amount', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 2 },
    { id: 2, name: 'Ghee', hsn: '0405', price: 50, qty: 2 }
  ];

  assert.deepEqual(pricing.computeTotals(items, ''), {
    subtotal: 300,
    discount: 0,
    taxable: 300,
    tax: 22,
    cgst: 11,
    sgst: 11,
    total: 322,
    lines: [
      { id: 1, name: 'Rice', hsn: '1006', gstPercent: 5, gross: 200, discount: 0, taxable: 200, tax: 10, net: 210 },
      { id: 2, name: 'Ghee', hsn: '0405', gstPercent: 12, gross: 100, discount: 0, taxable: 100, tax: 12, net: 112 }
    ]
  });
});

test('invoice uses the checkout HSN slab for invoice rows and totals', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 2 }]
  });

  assert.deepEqual(figures, {
    subtotal: 200,
    discount: 0,
    tax: 10,
    cgst: 5,
    sgst: 5,
    total: 210,
    rows: [{ name: 'Rice', sku: '-', hsn: '1006', qty: 2, price: 100, gstPercent: 5, line: 200, lineTax: 10 }]
  });
});

test('invoice matches checkout GST and total for an HSN-rated order', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 2 }];
  var checkout = pricing.computeTotals(items, '');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items });

  assert.equal(invoiceFigures.tax, checkout.tax);
  assert.equal(invoiceFigures.total, checkout.total);
  assert.equal(invoiceFigures.rows[0].gstPercent, checkout.lines[0].gstPercent);
});

test('invoice reads decimal gstRate values using checkout rate semantics', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Special rate item', gstRate: 0.05, price: 100, qty: 1 }]
  });

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 5);
  assert.equal(figures.total, 105);
});

test('invoice applies checkout coupon discount and tax calculations', function () {
  var items = [{ name: 'Rice', hsn: '1006', price: 100, qty: 10 }];
  var ledgerTotals = pricing.computeTotals(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10' });

  assert.equal(ledgerTotals.discount, 100);
  assert.equal(ledgerTotals.tax, 45);
  assert.equal(ledgerTotals.total, 945);
  assert.equal(invoiceFigures.discount, ledgerTotals.discount);
  assert.equal(invoiceFigures.tax, ledgerTotals.tax);
  assert.equal(invoiceFigures.total, ledgerTotals.total);
});

test('GST reconciliation marks an invoice using checkout figures as matched', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 10 }];
  var ledgerTotals = pricing.computeTotals(items, 'SAVE10');
  var result = reports.getGstReconciliation({
    orders: [{
      id: 7,
      date: '2026-11-21',
      customer: 'In-memory customer',
      items: items,
      coupon: 'SAVE10',
      subtotal: ledgerTotals.subtotal,
      discount: ledgerTotals.discount,
      tax: ledgerTotals.tax,
      total: ledgerTotals.total
    }]
  });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
  assert.equal(result.rows[0].ledgerTax, 45);
  assert.equal(result.rows[0].invoiceTax, 45);
});

test('CURRENT BEHAVIOUR: invoice HTML flags a ledger total difference', function () {
  var html = invoice.render({
    id: 8,
    date: '2026-11-21',
    total: 100,
    items: [{ name: 'Rice', hsn: '1006', price: 100, qty: 1 }]
  });

  assert.match(html, /Invoice computed total/);
  assert.match(html, /Order Ledger recorded total/);
  assert.match(html, /differs from Order Ledger/);
});
