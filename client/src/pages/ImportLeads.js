import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { toast } from 'react-toastify';
import { FaUpload, FaCloudUploadAlt, FaPaste, FaCheck, FaExclamationTriangle, FaArrowLeft, FaArrowRight, FaTimesCircle } from 'react-icons/fa';
import { leadsApi } from '../services/api';
import { autoMapColumns, CRM_FIELDS } from '../utils/columnMapper';

const STEPS = ['Input', 'Map Columns', 'Preview & Duplicates', 'Results'];

function ImportLeads() {
  const [step, setStep] = useState(0);
  const [inputTab, setInputTab] = useState('csv'); // 'csv' or 'paste'
  const [firstRowHeaders, setFirstRowHeaders] = useState(true);
  const [rawData, setRawData] = useState(null); // { headers: [], rows: [[]] }
  const [columnMapping, setColumnMapping] = useState({}); // { csvHeader: crmField }
  const [duplicates, setDuplicates] = useState([]); // from check-duplicates
  const [skipRows, setSkipRows] = useState(new Set()); // row indices to skip
  const [source, setSource] = useState('CSV Import');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null); // { created, errors }
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');

  // Parse CSV/TSV data
  const parseData = useCallback((text, isFile = false) => {
    const result = Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (result.errors.length > 0 && result.data.length === 0) {
      toast.error('Failed to parse data: ' + result.errors[0].message);
      return;
    }

    const allRows = result.data;
    if (allRows.length === 0) {
      toast.error('No data found');
      return;
    }

    let headers, rows;
    if (firstRowHeaders) {
      headers = allRows[0].map((h, i) => (h || '').trim() || `Column ${i + 1}`);
      rows = allRows.slice(1);
    } else {
      headers = allRows[0].map((_, i) => `Column ${i + 1}`);
      rows = allRows;
    }

    // Filter out completely empty rows
    rows = rows.filter(row => row.some(cell => cell && cell.trim()));

    if (rows.length === 0) {
      toast.error('No data rows found');
      return;
    }

    setRawData({ headers, rows });

    // Auto-map columns
    const mapping = autoMapColumns(headers);
    setColumnMapping(mapping);
    setStep(1);
  }, [firstRowHeaders]);

  // Handle file upload
  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => parseData(e.target.result, true);
    reader.readAsText(file);
  }, [parseData]);

  // Handle paste
  const handlePaste = useCallback(() => {
    if (!pasteText.trim()) {
      toast.error('Please paste some data first');
      return;
    }
    setFileName('');
    parseData(pasteText);
  }, [pasteText, parseData]);

  // Drag and drop handlers
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Update column mapping
  const updateMapping = (csvHeader, crmField) => {
    setColumnMapping(prev => {
      const next = { ...prev };
      // If this CRM field is already used by another header, clear it
      if (crmField) {
        for (const key of Object.keys(next)) {
          if (next[key] === crmField && key !== csvHeader) {
            next[key] = null;
          }
        }
      }
      next[csvHeader] = crmField || null;
      return next;
    });
  };

  // Build lead objects from mapped data
  const buildLeads = useCallback(() => {
    if (!rawData) return [];
    return rawData.rows.map((row, i) => {
      const lead = {};
      rawData.headers.forEach((header, colIdx) => {
        const field = columnMapping[header];
        if (field && row[colIdx]) {
          lead[field] = row[colIdx].trim();
        }
      });
      lead._rowIndex = i;
      return lead;
    });
  }, [rawData, columnMapping]);

  // Move to preview step — check duplicates
  const goToPreview = async () => {
    const leads = buildLeads();
    const names = leads
      .filter(l => l.dispensary_name)
      .map(l => l.dispensary_name);

    setCheckingDuplicates(true);
    try {
      const response = await leadsApi.checkDuplicates(names);
      setDuplicates(response.data.duplicates || []);
    } catch (err) {
      console.error('Error checking duplicates:', err);
      setDuplicates([]);
    }
    setCheckingDuplicates(false);
    setSkipRows(new Set());
    setStep(2);
  };

  // Get duplicate info for a row index
  const getDuplicatesForRow = (rowIndex) => {
    return duplicates.filter(d => d.input_index === rowIndex);
  };

  // Perform import
  const doImport = async () => {
    const leads = buildLeads()
      .filter((lead, i) => !skipRows.has(i) && lead.dispensary_name);

    if (leads.length === 0) {
      toast.error('No valid leads to import');
      return;
    }

    // Clean up internal fields
    const cleanLeads = leads.map(({ _rowIndex, ...rest }) => rest);

    setImporting(true);
    try {
      const response = await leadsApi.bulkCreate(cleanLeads, source);
      setResults(response.data);
      setStep(3);
      if (response.data.created > 0) {
        toast.success(`${response.data.created} leads imported successfully!`);
      }
    } catch (err) {
      console.error('Error importing leads:', err);
      toast.error('Failed to import leads');
    }
    setImporting(false);
  };

  // Check if dispensary_name is mapped
  const hasNameMapping = Object.values(columnMapping).includes('dispensary_name');

  // Render steps
  const renderStep = () => {
    switch (step) {
      case 0:
        return renderInputStep();
      case 1:
        return renderMappingStep();
      case 2:
        return renderPreviewStep();
      case 3:
        return renderResultsStep();
      default:
        return null;
    }
  };

  const renderInputStep = () => (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem' }}>
        <button
          className={`btn ${inputTab === 'csv' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setInputTab('csv')}
          style={{ borderRadius: '8px 0 0 8px' }}
        >
          <FaCloudUploadAlt /> Upload CSV
        </button>
        <button
          className={`btn ${inputTab === 'paste' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setInputTab('paste')}
          style={{ borderRadius: '0 8px 8px 0' }}
        >
          <FaPaste /> Paste from Spreadsheet
        </button>
      </div>

      {inputTab === 'csv' ? (
        <div
          className={`import-drop-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FaCloudUploadAlt size={48} style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <p style={{ fontSize: '1.125rem', fontWeight: 500, marginBottom: '0.5rem' }}>
            Drag & drop a CSV file here
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            or click to browse files
          </p>
          {fileName && (
            <p style={{ marginTop: '1rem', color: 'var(--primary-color)', fontWeight: 600 }}>
              Selected: {fileName}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div>
          <textarea
            className="import-paste-area"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste tab-separated or comma-separated data here...&#10;&#10;Example:&#10;Company Name&#9;Contact&#9;Email&#9;Phone&#10;Green Leaf&#9;John Smith&#9;john@greenleaf.com&#9;555-0123"
            rows={10}
            style={{
              width: '100%',
              padding: '1rem',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              resize: 'vertical',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handlePaste}
            disabled={!pasteText.trim()}
            style={{ marginTop: '1rem' }}
          >
            <FaArrowRight /> Parse Data
          </button>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', fontSize: '0.875rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={firstRowHeaders}
          onChange={(e) => setFirstRowHeaders(e.target.checked)}
          style={{ accentColor: 'var(--primary-color)' }}
        />
        First row contains headers
      </label>
    </div>
  );

  const renderMappingStep = () => {
    if (!rawData) return null;
    const previewRows = rawData.rows.slice(0, 3);

    return (
      <div>
        <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Map each column from your data to a CRM field. Columns mapped to "(Skip)" will be ignored.
        </p>

        {!hasNameMapping && (
          <div style={{ padding: '0.75rem 1rem', background: '#fff3cd', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem', color: '#856404' }}>
            <FaExclamationTriangle /> You must map at least one column to "Dispensary Name"
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="import-preview-table">
            <thead>
              <tr>
                {rawData.headers.map((header, i) => (
                  <th key={i} className="mapping-row">
                    <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem' }}>{header}</div>
                    <select
                      value={columnMapping[header] || ''}
                      onChange={(e) => updateMapping(header, e.target.value)}
                      style={{ width: '100%', padding: '0.375rem', fontSize: '0.8125rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                    >
                      <option value="">(Skip)</option>
                      {CRM_FIELDS.map(f => (
                        <option key={f.value} value={f.value} disabled={Object.values(columnMapping).includes(f.value) && columnMapping[header] !== f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => (
                <tr key={ri}>
                  {rawData.headers.map((_, ci) => (
                    <td key={ci} style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row[ci] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          Showing first {previewRows.length} of {rawData.rows.length} rows
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={() => { setStep(0); setRawData(null); }}>
            <FaArrowLeft /> Back
          </button>
          <button className="btn btn-primary" onClick={goToPreview} disabled={!hasNameMapping || checkingDuplicates}>
            {checkingDuplicates ? 'Checking duplicates...' : <><FaArrowRight /> Preview & Check Duplicates</>}
          </button>
        </div>
      </div>
    );
  };

  const renderPreviewStep = () => {
    const leads = buildLeads();
    const validLeads = leads.filter(l => l.dispensary_name);
    const skippedCount = [...skipRows].filter(i => validLeads.some(l => l._rowIndex === i)).length;
    const toImport = validLeads.filter(l => !skipRows.has(l._rowIndex)).length;
    const duplicateRowIndices = new Set(duplicates.map(d => d.input_index));

    return (
      <div>
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ padding: '0.75rem 1rem', background: '#d1e7dd', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
            <strong>{toImport}</strong> leads to import
          </div>
          {duplicates.length > 0 && (
            <div style={{ padding: '0.75rem 1rem', background: '#fff3cd', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
              <FaExclamationTriangle /> <strong>{new Set(duplicates.map(d => d.input_index)).size}</strong> potential duplicates found
            </div>
          )}
          {skippedCount > 0 && (
            <div style={{ padding: '0.75rem 1rem', background: '#f8d7da', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
              <strong>{skippedCount}</strong> rows will be skipped
            </div>
          )}
        </div>

        <div className="form-group" style={{ maxWidth: '300px', marginBottom: '1rem' }}>
          <label>Source Tag</label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Trade Show 2026"
          />
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table className="import-preview-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Skip</th>
                <th>#</th>
                {Object.entries(columnMapping).filter(([, v]) => v).map(([header, field]) => (
                  <th key={header}>{CRM_FIELDS.find(f => f.value === field)?.label || field}</th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {validLeads.map((lead) => {
                const rowDups = getDuplicatesForRow(lead._rowIndex);
                const isDuplicate = rowDups.length > 0;
                const isSkipped = skipRows.has(lead._rowIndex);

                return (
                  <tr key={lead._rowIndex} className={isDuplicate && !isSkipped ? 'import-row-duplicate' : ''} style={isSkipped ? { opacity: 0.5 } : {}}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSkipped}
                        onChange={(e) => {
                          const next = new Set(skipRows);
                          if (e.target.checked) next.add(lead._rowIndex);
                          else next.delete(lead._rowIndex);
                          setSkipRows(next);
                        }}
                        style={{ accentColor: 'var(--danger-color)' }}
                      />
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{lead._rowIndex + 1}</td>
                    {Object.entries(columnMapping).filter(([, v]) => v).map(([header, field]) => (
                      <td key={header} style={{ fontSize: '0.8125rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead[field] || ''}
                      </td>
                    ))}
                    <td style={{ fontSize: '0.8125rem' }}>
                      {isDuplicate ? (
                        <span style={{ color: '#e65100' }} title={rowDups.map(d => `Match: ${d.existing.dispensary_name} (${d.existing.city || 'no city'})`).join(', ')}>
                          <FaExclamationTriangle /> Duplicate
                        </span>
                      ) : (
                        <span style={{ color: 'var(--success-color)' }}>
                          <FaCheck /> New
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {duplicates.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                const dupIndices = new Set(duplicates.map(d => d.input_index));
                setSkipRows(prev => new Set([...prev, ...dupIndices]));
              }}
            >
              Skip all duplicates
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                const dupIndices = new Set(duplicates.map(d => d.input_index));
                setSkipRows(prev => {
                  const next = new Set(prev);
                  dupIndices.forEach(i => next.delete(i));
                  return next;
                });
              }}
            >
              Import all duplicates
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn-outline" onClick={() => setStep(1)}>
            <FaArrowLeft /> Back
          </button>
          <button className="btn btn-primary" onClick={doImport} disabled={importing || toImport === 0}>
            {importing ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                Importing...
              </>
            ) : (
              <><FaUpload /> Import {toImport} Leads</>
            )}
          </button>
        </div>
      </div>
    );
  };

  const renderResultsStep = () => {
    if (!results) return null;

    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        {results.created > 0 ? (
          <div style={{ marginBottom: '2rem' }}>
            <FaCheck size={48} style={{ color: 'var(--success-color)', marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Import Complete</h3>
            <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)' }}>
              <strong>{results.created}</strong> leads created successfully
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: '2rem' }}>
            <FaTimesCircle size={48} style={{ color: 'var(--danger-color)', marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>No Leads Created</h3>
          </div>
        )}

        {results.errors.length > 0 && (
          <div style={{ textAlign: 'left', maxWidth: '500px', margin: '0 auto 2rem', padding: '1rem', background: '#f8d7da', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
            <strong>{results.errors.length} rows had errors:</strong>
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              {results.errors.slice(0, 10).map((e, i) => (
                <li key={i}>Row {e.row + 1}: {e.error}</li>
              ))}
              {results.errors.length > 10 && <li>...and {results.errors.length - 10} more</li>}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link to="/leads" className="btn btn-primary">View All Leads</Link>
          <button
            className="btn btn-outline"
            onClick={() => {
              setStep(0);
              setRawData(null);
              setResults(null);
              setDuplicates([]);
              setSkipRows(new Set());
              setPasteText('');
              setFileName('');
            }}
          >
            Import More
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="form-container" style={{ maxWidth: '1100px' }}>
      <div className="form-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2><FaUpload style={{ marginRight: '0.5rem' }} /> Import Leads</h2>
        <Link to="/leads" className="btn btn-sm btn-outline">
          <FaArrowLeft /> Back to Leads
        </Link>
      </div>

      {/* Step indicator */}
      <div className="import-step-indicator">
        {STEPS.map((label, i) => (
          <div key={i} className={`import-step ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}>
            <div className="import-step-dot">
              {i < step ? <FaCheck size={10} /> : i + 1}
            </div>
            <span className="import-step-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="form-body">
        {renderStep()}
      </div>
    </div>
  );
}

export default ImportLeads;
