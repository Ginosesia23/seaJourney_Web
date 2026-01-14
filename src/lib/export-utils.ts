/**
 * Export utilities for sea time data
 * Supports CSV, Excel XML, JSON, and PDF formats
 */

import type { SeaTimeReportData } from '@/app/actions';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

/**
 * Export sea time data to CSV format
 */
export function exportToCSV(data: SeaTimeReportData): void {
  const headers = [
    'Vessel Name',
    'Start Date',
    'End Date',
    'Total Days',
    'At Sea Days',
    'Standby Days',
    'Yard Days',
    'Leave Days',
  ];

  const rows = data.serviceRecords.map(record => [
    record.vesselName,
    record.start_date,
    record.end_date,
    record.totalDays.toString(),
    record.at_sea_days?.toString() || '0',
    record.standby_days?.toString() || '0',
    record.yard_days?.toString() || '0',
    record.leave_days?.toString() || '0',
  ]);

  // Add summary row
  rows.push([
    'TOTAL',
    '',
    '',
    data.totalDays.toString(),
    data.totalSeaDays.toString(),
    data.totalStandbyDays.toString(),
    '',
    '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export sea time data to Excel format (.xlsx)
 */
export function exportToExcelXML(data: SeaTimeReportData): void {

  // Prepare data for Excel
  const headers = [
    'Vessel Name',
    'Start Date',
    'End Date',
    'Total Days',
    'At Sea Days',
    'Standby Days',
    'Yard Days',
    'Leave Days',
  ];

  // Group service records by vessel and sort chronologically
  const recordsByVessel = new Map<string, typeof data.serviceRecords>();
  
  data.serviceRecords.forEach(record => {
    const vesselName = record.vesselName;
    if (!recordsByVessel.has(vesselName)) {
      recordsByVessel.set(vesselName, []);
    }
    recordsByVessel.get(vesselName)!.push(record);
  });

  // Sort records within each vessel by start date
  recordsByVessel.forEach((records, vesselName) => {
    records.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  });

  // Convert to rows, grouped by vessel
  const rows: any[] = [];
  let currentVessel: string | null = null;

  // Sort vessels alphabetically for consistent output
  const sortedVessels = Array.from(recordsByVessel.keys()).sort();

  sortedVessels.forEach(vesselName => {
    const vesselRecords = recordsByVessel.get(vesselName)!;
    
    vesselRecords.forEach(record => {
      // Add vessel name row if this is a new vessel (for grouping)
      if (currentVessel !== vesselName) {
        if (currentVessel !== null) {
          // Add empty row between vessels for visual separation
          rows.push(['', '', '', '', '', '', '', '']);
        }
        currentVessel = vesselName;
      }

      rows.push([
        record.vesselName,
        record.start_date,
        record.end_date,
        record.totalDays,
        record.at_sea_days || 0,
        record.standby_days || 0,
        record.yard_days || 0,
        record.leave_days || 0,
      ]);
    });
  });

  // Add empty row before summary
  if (rows.length > 0) {
    rows.push(['', '', '', '', '', '', '', '']);
  }

  // Add summary row
  rows.push([
    'TOTAL',
    '',
    '',
    data.totalDays,
    data.totalSeaDays,
    data.totalStandbyDays,
    '',
    '',
  ]);

  // Create worksheet
  const worksheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths for better readability
  worksheet['!cols'] = [
    { wch: 20 }, // Vessel Name
    { wch: 12 }, // Start Date
    { wch: 12 }, // End Date
    { wch: 12 }, // Total Days
    { wch: 12 }, // At Sea Days
    { wch: 12 }, // Standby Days
    { wch: 12 }, // Yard Days
    { wch: 12 }, // Leave Days
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sea Time');

  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { 
    type: 'array', 
    bookType: 'xlsx',
  });

  // Create blob and download
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-export-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export sea time data to JSON format
 */
export function exportToJSON(data: SeaTimeReportData): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `sea-time-export-${format(new Date(), 'yyyy-MM-dd')}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

