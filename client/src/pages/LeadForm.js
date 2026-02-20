import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaSave, FaTimes, FaArrowLeft } from 'react-icons/fa';
import { leadsApi } from '../services/api';
import { STAGES } from '../constants/stages';

const initialFormState = {
  contact_date: new Date().toISOString().split('T')[0],
  dispensary_name: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  dispensary_number: '',
  contact_name: '',
  contact_position: '',
  manager_name: '',
  owner_name: '',
  contact_number: '',
  contact_email: '',
  website: '',
  current_pos_system: '',
  notes: '',
  callback_days: [],
  callback_time_slots: [],
  callback_time_from: '',
  callback_time_to: '',
  priority: 'Medium',
  stage: 'New Lead',
  callback_date: '',
  deal_value: ''
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = ['All Day', 'Morning', 'Afternoon', 'Evening'];
const BUSINESS_HOURS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM'
];

function LeadForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);
  const [errors, setErrors] = useState({});
  const addressInputRef = useRef(null);

  // Google Places Autocomplete for the Location field
  useEffect(() => {
    const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    let autocomplete;

    function initAutocomplete() {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          setFormData(prev => ({ ...prev, address: place.formatted_address }));
        }
      });
    }

    if (window.google?.maps?.places) {
      initAutocomplete();
    } else if (!document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = initAutocomplete;
      document.head.appendChild(script);
    } else {
      // Script is loading but not ready yet — poll for it
      const interval = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(interval);
          initAutocomplete();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (autocomplete) {
        window.google?.maps?.event?.clearInstanceListeners(autocomplete);
      }
    };
  }, []);

  const fetchLead = useCallback(async () => {
    try {
      const response = await leadsApi.getById(id);
      const lead = response.data;

      // Parse callback_days from JSON string to array
      if (lead.callback_days && typeof lead.callback_days === 'string') {
        try {
          lead.callback_days = JSON.parse(lead.callback_days);
        } catch {
          lead.callback_days = [];
        }
      }

      // Parse callback_time_slots from JSON string to array
      if (lead.callback_time_slots && typeof lead.callback_time_slots === 'string') {
        try {
          lead.callback_time_slots = JSON.parse(lead.callback_time_slots);
        } catch {
          lead.callback_time_slots = [];
        }
      }

      setFormData({
        ...initialFormState,
        ...lead
      });
    } catch (error) {
      console.error('Error fetching lead:', error);
      toast.error('Failed to load lead data');
      navigate('/leads');
    } finally {
      setFetching(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (isEditing) {
      fetchLead();
    }
  }, [isEditing, fetchLead]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value
    }));

    // Clear error when field is changed
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const formatPhoneNumber = (value) => {
    // Remove all non-digits
    let digits = value.replace(/\D/g, '');

    // Strip leading country code 1 if 11 digits
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.slice(1);
    }

    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e) => {
    const { name, value } = e.target;
    const formatted = formatPhoneNumber(value);
    setFormData(prev => ({
      ...prev,
      [name]: formatted
    }));
  };

  const handleDayChange = (day) => {
    setFormData(prev => {
      const currentDays = Array.isArray(prev.callback_days) ? prev.callback_days : [];
      if (currentDays.includes(day)) {
        return { ...prev, callback_days: currentDays.filter(d => d !== day) };
      } else {
        return { ...prev, callback_days: [...currentDays, day] };
      }
    });
  };

  const handleTimeSlotChange = (slot) => {
    setFormData(prev => {
      const currentSlots = Array.isArray(prev.callback_time_slots) ? prev.callback_time_slots : [];
      if (currentSlots.includes(slot)) {
        return { ...prev, callback_time_slots: currentSlots.filter(s => s !== slot) };
      } else {
        return { ...prev, callback_time_slots: [...currentSlots, slot] };
      }
    });
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.dispensary_name.trim()) {
      newErrors.dispensary_name = 'Dispensary name is required';
    }

    if (!formData.contact_date) {
      newErrors.contact_date = 'Contact date is required';
    }

    if (formData.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
      newErrors.contact_email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      toast.error('Please fix the form errors');
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        await leadsApi.update(id, formData);
        toast.success('Lead updated successfully');
      } else {
        await leadsApi.create(formData);
        toast.success('Lead created successfully');
      }
      navigate('/leads');
    } catch (error) {
      console.error('Error saving lead:', error);
      const message = error.response?.data?.error || 'Failed to save lead';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="lead-form-page">
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/leads" className="btn btn-outline">
          <FaArrowLeft /> Back to Leads
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-header">
          <h2>{isEditing ? 'Edit Lead' : 'Add New Lead'}</h2>
        </div>

        <div className="form-body">
          {/* Basic Information */}
          <div className="form-section">
            <h3>Basic Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  Dispensary Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="dispensary_name"
                  value={formData.dispensary_name}
                  onChange={handleChange}
                  placeholder="Enter dispensary name"
                  style={errors.dispensary_name ? { borderColor: '#dc3545' } : {}}
                />
                {errors.dispensary_name && (
                  <span style={{ color: '#dc3545', fontSize: '0.75rem' }}>
                    {errors.dispensary_name}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  ref={addressInputRef}
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="City, State or full address"
                />
              </div>

              <div className="form-group">
                <label>
                  Contact Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  name="contact_date"
                  value={formData.contact_date}
                  onChange={handleChange}
                  style={errors.contact_date ? { borderColor: '#dc3545' } : {}}
                />
              </div>

              <div className="form-group">
                <label>Dispensary Phone Number</label>
                <input
                  type="tel"
                  name="dispensary_number"
                  value={formData.dispensary_number}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="form-group">
                <label>Website</label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://example.com"
                />
              </div>

              <div className="form-group">
                <label>Current POS System</label>
                <select name="current_pos_system" value={formData.current_pos_system} onChange={handleChange}>
                  <option value="">Select POS...</option>
                  <option value="AIQ">AIQ</option>
                  <option value="Blaze">Blaze</option>
                  <option value="Cova">Cova</option>
                  <option value="Dutchie">Dutchie</option>
                  <option value="Meadow">Meadow</option>
                  <option value="Treez">Treez</option>
                  <option value="Weave">Weave</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>

              <div className="form-group">
                <label>Monthly Value</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6c757d', fontWeight: 500 }}>$</span>
                  <input
                    type="number"
                    name="deal_value"
                    value={formData.deal_value}
                    onChange={handleChange}
                    placeholder="500"
                    step="0.01"
                    min="0"
                    style={{ paddingLeft: '1.5rem' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="form-section">
            <h3>Contact Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  name="manager_name"
                  value={formData.manager_name}
                  onChange={handleChange}
                  placeholder="Name"
                />
              </div>

              <div className="form-group">
                <label>Role</label>
                <select name="owner_name" value={formData.owner_name} onChange={handleChange}>
                  <option value="">Select position...</option>
                  <option value="Manager">Manager</option>
                  <option value="Owner">Owner</option>
                </select>
              </div>

              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="contact_number"
                  value={formData.contact_number}
                  onChange={handlePhoneChange}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="contact_email"
                  value={formData.contact_email}
                  onChange={handleChange}
                  placeholder="email@example.com"
                  style={errors.contact_email ? { borderColor: '#dc3545' } : {}}
                />
                {errors.contact_email && (
                  <span style={{ color: '#dc3545', fontSize: '0.75rem' }}>
                    {errors.contact_email}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Reference</label>
                <input
                  type="text"
                  name="contact_name"
                  value={formData.contact_name}
                  onChange={handleChange}
                  placeholder="Who referred you?"
                />
              </div>
            </div>
          </div>

          {/* Callback Information */}
          <div className="form-section">
            <h3>Callback Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Priority</label>
                <select name="priority" value={formData.priority} onChange={handleChange}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="form-group">
                <label>Stage</label>
                <select name="stage" value={formData.stage} onChange={handleChange}>
                  {STAGES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Callback Date</label>
                <input
                  type="date"
                  name="callback_date"
                  value={formData.callback_date}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group full-width">
                <label>Best Day(s) to Call</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {DAYS_OF_WEEK.map(day => (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Array.isArray(formData.callback_days) && formData.callback_days.includes(day)}
                        onChange={() => handleDayChange(day)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>{day}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group full-width">
                <label>Best Time to Call</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {TIME_SLOTS.map(slot => (
                    <label key={slot} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Array.isArray(formData.callback_time_slots) && formData.callback_time_slots.includes(slot)}
                        onChange={() => handleTimeSlotChange(slot)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.875rem' }}>{slot}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>From</label>
                <select name="callback_time_from" value={formData.callback_time_from} onChange={handleChange}>
                  <option value="">Select time...</option>
                  {BUSINESS_HOURS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>To</label>
                <select name="callback_time_to" value={formData.callback_time_to} onChange={handleChange}>
                  <option value="">Select time...</option>
                  {BUSINESS_HOURS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="form-section">
            <h3>Notes</h3>
            <div className="form-group full-width">
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Add any relevant notes about this lead, conversation details, special requirements, etc."
                rows="5"
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Link to="/leads" className="btn btn-outline">
            <FaTimes /> Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <FaSave /> {loading ? 'Saving...' : (isEditing ? 'Update Lead' : 'Create Lead')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LeadForm;
