// FILE: src/App.js
// Replace the entire contents of your App.js with this code

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Papa from 'papaparse';
import './App.css';

// ============================================
// API BASE URL
// ============================================
const API_URL = process.env.REACT_APP_API_URL || '/api';

// ============================================
// AUTH CONTEXT (manages user state)
// ============================================
const AuthContext = React.createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  const signin = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('token', userToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${userToken}`;
  };

  const signout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, signin, signout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================
// HEADER COMPONENT
// ============================================
function Header() {
  const { user, signout } = React.useContext(AuthContext);
  const navigate = useNavigate();

  const handleSignout = async () => {
    try {
      await axios.post(`${API_URL}/auth/signout`);
      signout();
      navigate('/');
    } catch (error) {
      console.error('Signout error:', error);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <h1>Under Review</h1>
        </Link>
        <nav>
          {user ? (
            <>
              <Link to="/import" className="nav-link">Import CSV</Link>
              <Link to="/profile" className="username">@{user.user_metadata?.username || user.email}</Link>
              <button onClick={handleSignout} className="btn-secondary">Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/signin" className="btn-secondary">Sign In</Link>
              <Link to="/signup" className="btn-primary">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// ============================================
// CONFIDENCE BADGE COMPONENT
// ============================================
function ConfidenceBadge({ badge, size = 'normal' }) {
  const badges = {
    active: {
      emoji: '🟢',
      label: 'Active Pipeline',
      description: 'Multiple applicants at different stages',
      className: 'badge-active'
    },
    unclear: {
      emoji: '🟡',
      label: 'Unclear Status',
      description: 'Few applicants or mostly "Applied"',
      className: 'badge-unclear'
    },
    ghost: {
      emoji: '🔴',
      label: 'Possible Ghost Posting',
      description: 'Many applicants, no movement',
      className: 'badge-ghost'
    },
    new: {
      emoji: '🔵',
      label: 'New Posting',
      description: 'Recently added, not enough data yet',
      className: 'badge-new'
    }
  };

  const badgeInfo = badges[badge] || badges.new;
  const sizeClass = size === 'small' ? 'confidence-badge-small' : 'confidence-badge';

  return (
    <div className={`${sizeClass} ${badgeInfo.className}`} title={badgeInfo.description}>
      <span className="badge-emoji">{badgeInfo.emoji}</span>
      <span className="badge-label">{badgeInfo.label}</span>
    </div>
  );
}

// ============================================
// HOME PAGE (Search)
// ============================================
function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await axios.get(`${API_URL}/roles/search`, {
        params: { query: searchQuery }
      });
      setSearchResults(response.data.roles);
    } catch (error) {
      console.error('Search error:', error);
      alert('Error searching roles');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="page home-page">
      <div className="hero">
        <h2>Find Your Role.</h2>
        <p>You've applied, what's next? Connect anonymously with others in the competitive pipeline. Share insights, timelines, and provide support.</p>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Search for a role (e.g., Evisort Sr. Management Consultant)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="btn-primary" disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="search-results">
          <h3>Results ({searchResults.length})</h3>
          {searchResults.map(role => (
            <div key={role.id} className="role-card" onClick={() => navigate(`/role/${role.id}`)}>
              <div className="role-card-header">
                <h4>{role.full_role_name}</h4>
                {role.confidence_badge && (
                  <ConfidenceBadge badge={role.confidence_badge} size="small" />
                )}
              </div>
              <p className="role-location">{role.location || 'Location not specified'}</p>
              <p className="role-meta">
                {role.total_applicants || 0} applicant{role.total_applicants !== 1 ? 's' : ''} • 
                Created {new Date(role.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {searchResults.length === 0 && searchQuery && !isSearching && (
        <div className="no-results">
          <p>No roles found for "{searchQuery}"</p>
          <button 
            onClick={() => navigate('/create-role', { state: { searchQuery } })}
            className="btn-primary"
          >
            Create This Role
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// CREATE ROLE PAGE
// ============================================
function CreateRolePage() {
  const { user } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    company: '',
    role_title: '',
    location: '',
    job_url: '',
  });
  const [duplicateCheck, setDuplicateCheck] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) {
    return (
      <div className="page">
        <div className="auth-required">
          <h2>Sign in required</h2>
          <p>You need to be signed in to create a role.</p>
          <button onClick={() => navigate('/signin')} className="btn-primary">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const checkDuplicates = async () => {
    if (!formData.company || !formData.role_title) return;

    setIsChecking(true);
    try {
      const response = await axios.get(`${API_URL}/roles/check-duplicates`, {
        params: {
          company: formData.company,
          role_title: formData.role_title,
          location: formData.location,
        }
      });
      setDuplicateCheck(response.data);
    } catch (error) {
      console.error('Duplicate check error:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (duplicateCheck?.is_exact_duplicate) {
      alert('This exact role already exists. Please join the existing one.');
      navigate(`/role/${duplicateCheck.exact_match.id}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/roles`, formData);
      navigate(`/role/${response.data.role.id}`);
    } catch (error) {
      console.error('Create role error:', error);
      alert(error.response?.data?.error || 'Error creating role');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page create-role-page">
      <h2>Create New Role</h2>
      
      <form onSubmit={handleSubmit} className="role-form">
        <div className="form-group">
          <label>Company *</label>
          <input
            type="text"
            required
            value={formData.company}
            onChange={(e) => setFormData({...formData, company: e.target.value})}
            onBlur={checkDuplicates}
            placeholder="e.g., Evisort"
          />
        </div>

        <div className="form-group">
          <label>Role Title *</label>
          <input
            type="text"
            required
            value={formData.role_title}
            onChange={(e) => setFormData({...formData, role_title: e.target.value})}
            onBlur={checkDuplicates}
            placeholder="e.g., Sr. Management Consultant"
          />
        </div>

        <div className="form-group">
          <label>Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({...formData, location: e.target.value})}
            onBlur={checkDuplicates}
            placeholder="e.g., San Francisco, CA or Remote"
          />
        </div>

        <div className="form-group">
          <label>Job URL (optional)</label>
          <input
            type="url"
            value={formData.job_url}
            onChange={(e) => setFormData({...formData, job_url: e.target.value})}
            placeholder="https://..."
          />
          <small>Link to the original job posting</small>
        </div>

        {isChecking && <p className="checking">Checking for duplicates...</p>}

        {duplicateCheck?.is_exact_duplicate && (
          <div className="duplicate-warning">
            <strong>⚠️ This exact role already exists!</strong>
            <button 
              type="button"
              onClick={() => navigate(`/role/${duplicateCheck.exact_match.id}`)}
              className="btn-secondary"
            >
              Go to existing role
            </button>
          </div>
        )}

        {duplicateCheck?.similar_roles?.length > 0 && !duplicateCheck.is_exact_duplicate && (
          <div className="similar-roles">
            <strong>Similar roles found:</strong>
            {duplicateCheck.similar_roles.slice(0, 3).map(role => (
              <div key={role.id} className="similar-role" onClick={() => navigate(`/role/${role.id}`)}>
                {role.full_role_name} {role.location && `- ${role.location}`}
              </div>
            ))}
          </div>
        )}

        <button 
          type="submit" 
          className="btn-primary"
          disabled={isSubmitting || duplicateCheck?.is_exact_duplicate}
        >
          {isSubmitting ? 'Creating...' : 'Create Role'}
        </button>
      </form>
    </div>
  );
}

// ============================================
// ROLE PAGE (Dashboard + Insights)
// ============================================
function RolePage() {
  const { id } = useParams();
  const { user } = React.useContext(AuthContext);
  const [role, setRole] = useState(null);
  const [stats, setStats] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showInsightForm, setShowInsightForm] = useState(false);
  const [insightForm, setInsightForm] = useState({
    content: '',
    insight_type: 'general',
    is_anonymous: false,
  });
  const [insightFilter, setInsightFilter] = useState('all');

  useEffect(() => {
    loadRoleData();
  }, [id]);

  const loadRoleData = async () => {
    try {
      const roleResponse = await axios.get(`${API_URL}/roles/${id}`);
      setRole(roleResponse.data.role);
      setStats(roleResponse.data.stats);

      const insightsResponse = await axios.get(`${API_URL}/insights/role/${id}`);
      setInsights(insightsResponse.data.insights);

      if (user) {
        try {
          const trackingResponse = await axios.get(`${API_URL}/tracking/role/${id}`);
          setTracking(trackingResponse.data.tracking);
        } catch (error) {
          console.log('Not tracking this role');
        }
      }
    } catch (error) {
      console.error('Error loading role:', error);
      alert('Error loading role');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRole = async (status = 'applied') => {
    if (!user) {
      alert('Please sign in to join this role');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/tracking`, {
        role_id: id,
        status,
      });
      setTracking(response.data.tracking);
      loadRoleData(); // Refresh stats
    } catch (error) {
      console.error('Error joining role:', error);
      alert(error.response?.data?.error || 'Error joining role');
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    try {
      const response = await axios.patch(`${API_URL}/tracking/${tracking.id}`, {
        status: newStatus,
      });
      setTracking(response.data.tracking);
      loadRoleData(); // Refresh stats
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Error updating status');
    }
  };

  const handlePostInsight = async (e) => {
    e.preventDefault();
    if (!user) {
      alert('Please sign in to post insights');
      return;
    }

    try {
      await axios.post(`${API_URL}/insights`, {
        role_id: id,
        ...insightForm,
      });
      setInsightForm({ content: '', insight_type: 'general', is_anonymous: false });
      setShowInsightForm(false);
      loadRoleData(); // Refresh insights
    } catch (error) {
      console.error('Error posting insight:', error);
      alert('Error posting insight');
    }
  };

  if (loading) {
    return <div className="page">Loading...</div>;
  }

  if (!role) {
    return <div className="page">Role not found</div>;
  }

  return (
    <div className="page role-page">
      <div className="role-header">
        <div className="role-title-row">
          <h2>
            <span className="role-company">{role.company}</span>
            <span className="role-separator"> - </span>
            <span className="role-title-text">{role.role_title}</span>
          </h2>
          {stats.confidence_badge && (
            <ConfidenceBadge badge={stats.confidence_badge} size="normal" />
          )}
        </div>
        {role.location && <p className="role-location">📍 {role.location}</p>}
        <p className="role-meta">
          📅 Created {new Date(role.created_at).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
          {stats.latest_activity_at && ` • Last activity ${new Date(stats.latest_activity_at).toLocaleDateString()}`}
        </p>
        {role.job_url && (
          <a href={role.job_url} target="_blank" rel="noopener noreferrer" className="job-link">
            View Original Posting →
          </a>
        )}
      </div>

      {/* Role at a Glance Dashboard */}
      <div className="dashboard">
        <h3>Role at a Glance</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-value">{stats.total_applicants}</div>
            <div className="stat-label">Applicants on Under Review</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-value">{stats.recruiter_screen_count}</div>
            <div className="stat-label">Recruiter Screen</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🎤</div>
            <div className="stat-value">{stats.interviewing_count}</div>
            <div className="stat-label">Interviewing</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🏁</div>
            <div className="stat-value">{stats.final_round_count}</div>
            <div className="stat-label">Final Round</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📩</div>
            <div className="stat-value">{stats.rejected_count}</div>
            <div className="stat-label">Rejected</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{stats.offer_count}</div>
            <div className="stat-label">Offered</div>
          </div>
        </div>
      </div>

      {/* User Status Section */}
      <div className="user-status">
        {!user ? (
          <p>Sign in to join this role's community</p>
        ) : !tracking ? (
          <button onClick={() => handleJoinRole()} className="btn-primary">
            Join This Role
          </button>
        ) : (
          <div className="status-selector">
            <label>Your Status:</label>
            <select 
              value={tracking.status} 
              onChange={(e) => handleUpdateStatus(e.target.value)}
              className="status-dropdown"
            >
              <option value="applied">Applied</option>
              <option value="recruiter_screen">Recruiter Screen</option>
              <option value="interviewing">Interviewing</option>
              <option value="final_round">Final Round</option>
              <option value="offer">Offer</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        )}
      </div>

      {/* Review Room */}
      <div className="review-room">
        <div className="review-room-header">
          <h3>The Review Room</h3>
          {user && tracking && (
            <button 
              onClick={() => setShowInsightForm(!showInsightForm)}
              className="btn-primary"
            >
              {showInsightForm ? 'Cancel' : 'Share Insight'}
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div className="insight-filters">
          <button 
            className={`filter-btn ${insightFilter === 'all' ? 'active' : ''}`}
            onClick={() => setInsightFilter('all')}
          >
            All
          </button>
          <button 
            className={`filter-btn ${insightFilter === 'timeline_update' ? 'active' : ''}`}
            onClick={() => setInsightFilter('timeline_update')}
          >
            Timeline
          </button>
          <button 
            className={`filter-btn ${insightFilter === 'interview_question' ? 'active' : ''}`}
            onClick={() => setInsightFilter('interview_question')}
          >
            Interview
          </button>
          <button 
            className={`filter-btn ${insightFilter === 'company_culture' ? 'active' : ''}`}
            onClick={() => setInsightFilter('company_culture')}
          >
            Culture
          </button>
          <button 
            className={`filter-btn ${insightFilter === 'salary_info' ? 'active' : ''}`}
            onClick={() => setInsightFilter('salary_info')}
          >
            Salary
          </button>
          <button 
            className={`filter-btn ${insightFilter === 'general' ? 'active' : ''}`}
            onClick={() => setInsightFilter('general')}
          >
            General
          </button>
        </div>

        {showInsightForm && (
          <form onSubmit={handlePostInsight} className="insight-form">
            <textarea
              required
              value={insightForm.content}
              onChange={(e) => setInsightForm({...insightForm, content: e.target.value})}
              placeholder="Share your insight..."
              rows="4"
            />
            <div className="form-row">
              <select
                value={insightForm.insight_type}
                onChange={(e) => setInsightForm({...insightForm, insight_type: e.target.value})}
              >
                <option value="general">General</option>
                <option value="timeline_update">Timeline Update</option>
                <option value="interview_question">Interview Question</option>
                <option value="company_culture">Company Culture</option>
                <option value="salary_info">Salary Info</option>
              </select>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={insightForm.is_anonymous}
                  onChange={(e) => setInsightForm({...insightForm, is_anonymous: e.target.checked})}
                />
                Post anonymously
              </label>
            </div>
            <button type="submit" className="btn-primary">Post</button>
          </form>
        )}

        <div className="insights-list">
          {insights.length === 0 ? (
            <p className="no-insights">No insights yet. Be the first to share!</p>
          ) : (
            insights
              .filter(insight => insightFilter === 'all' || insight.insight_type === insightFilter)
              .map(insight => (
                <div key={insight.id} className="insight-card">
                  <div className="insight-header">
                    <span className="insight-author">{insight.author_username}</span>
                    <span className="insight-type">{insight.insight_type.replace('_', ' ')}</span>
                  </div>
                  <p className="insight-content">{insight.content}</p>
                  <span className="insight-date">
                    {new Date(insight.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// CSV IMPORT PAGE
// ============================================
function ImportPage() {
  const { user } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: upload, 2: mapping, 3: preview, 4: results
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({
    company: '',
    role_title: '',
    location: '',
    status: '',
  });
  const [previewData, setPreviewData] = useState([]);
  const [importResults, setImportResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!user) {
    return (
      <div className="page">
        <div className="auth-required">
          <h2>Sign in required</h2>
          <p>You need to be signed in to import your job tracker.</p>
          <button onClick={() => navigate('/signin')} className="btn-primary">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          alert('No data found in CSV file');
          return;
        }
        setCsvData(results.data);
        setHeaders(Object.keys(results.data[0]));
        setStep(2);
      },
      error: (error) => {
        alert('Error parsing CSV: ' + error.message);
      },
    });
  };

  const handleMapping = () => {
    if (!mapping.company || !mapping.role_title) {
      alert('Company and Role Title are required fields');
      return;
    }

    // Create preview data
    const preview = csvData.slice(0, 10).map(row => ({
      company: row[mapping.company],
      role_title: row[mapping.role_title],
      location: mapping.location ? row[mapping.location] : '',
      status: mapping.status ? row[mapping.status] : 'applied',
    }));

    setPreviewData(preview);
    setStep(3);
  };

  const normalizeStatus = (statusValue) => {
    if (!statusValue) return 'applied';
    
    const normalized = statusValue.toLowerCase().trim();
    const statusMap = {
      'applied': 'applied',
      'apply': 'applied',
      'application sent': 'applied',
      'recruiter screen': 'recruiter_screen',
      'phone screen': 'recruiter_screen',
      'screening': 'recruiter_screen',
      'interviewing': 'interviewing',
      'interview': 'interviewing',
      'interviews': 'interviewing',
      'final round': 'final_round',
      'final': 'final_round',
      'onsite': 'final_round',
      'offer': 'offer',
      'accepted': 'offer',
      'rejected': 'rejected',
      'declined': 'rejected',
      'no': 'rejected',
    };

    return statusMap[normalized] || 'applied';
  };

  const handleImport = async () => {
    setIsProcessing(true);
    const results = {
      total: csvData.length,
      created: 0,
      joined: 0,
      skipped: 0,
      errors: [],
    };

    try {
      for (const row of csvData) {
        const company = row[mapping.company]?.trim();
        const role_title = row[mapping.role_title]?.trim();
        const location = mapping.location ? row[mapping.location]?.trim() : '';
        const status = normalizeStatus(mapping.status ? row[mapping.status] : 'applied');

        if (!company || !role_title) {
          results.skipped++;
          continue;
        }

        try {
          // Check if role exists using the roles table (not the view)
          const searchResponse = await axios.get(`${API_URL}/roles/check-duplicates`, {
            params: { company, role_title, location },
          });

          let roleId;

          if (searchResponse.data.is_exact_duplicate) {
            // Role exists, use existing
            roleId = searchResponse.data.exact_match.id;
          } else {
            // Create new role
            try {
              const createResponse = await axios.post(`${API_URL}/roles`, {
                company,
                role_title,
                location: location || null,
              });
              roleId = createResponse.data.role.id;
              results.created++;
            } catch (createError) {
              // If creation fails (maybe created between check and create), skip
              console.error('Create error:', createError);
              results.skipped++;
              continue;
            }
          }

          // Verify we have a valid roleId
          if (!roleId) {
            console.error('No roleId for', company, role_title);
            results.errors.push(`${company} ${role_title}: Could not determine role ID`);
            continue;
          }

          console.log('Attempting to track role:', roleId, 'with status:', status);

          // Try to join the role with status
          try {
            const trackResponse = await axios.post(`${API_URL}/tracking`, {
              role_id: roleId,
              status,
            });
            console.log('Track response:', trackResponse.data);
            results.joined++;
          } catch (trackError) {
            console.error('Track error:', trackError.response?.data);
            // Already tracking this role - that's fine
            if (trackError.response?.status === 400 && 
                trackError.response?.data?.error?.includes('already tracking')) {
              results.skipped++;
            } else {
              // Some other error
              results.errors.push(`${company} ${role_title}: ${trackError.response?.data?.error || trackError.message}`);
            }
          }
        } catch (error) {
          console.error('Outer error:', error);
          // Unexpected error
          results.errors.push(`${company} ${role_title}: ${error.response?.data?.error || error.message}`);
        }
      }

      setImportResults(results);
      setStep(4);
    } catch (error) {
      alert('Import failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="page import-page">
      <h2>Import Your Job Tracker</h2>
      <p className="import-subtitle">
        Upload a CSV file from Excel, Google Sheets, Notion, or any other spreadsheet tool
      </p>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="import-step">
          <div className="upload-area">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              id="csv-upload"
              className="file-input"
            />
            <label htmlFor="csv-upload" className="upload-label">
              <div className="upload-icon">📁</div>
              <h3>Choose CSV File</h3>
              <p>or drag and drop here</p>
              <p className="upload-hint">Required: Company, Role Title • Optional: Location, Status</p>
            </label>
          </div>

          <div className="import-instructions">
            <h3>📋 How to prepare your file:</h3>
            <ol>
              <li>Export your job tracker as CSV from Excel, Sheets, or Notion</li>
              <li>Make sure you have columns for Company and Role Title (required)</li>
              <li>Optionally include Location and Status columns</li>
              <li>Remove any personal notes or sensitive information</li>
            </ol>
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 2 && (
        <div className="import-step">
          <h3>Map Your Columns</h3>
          <p>Match your spreadsheet columns to Under Review fields</p>

          <div className="mapping-form">
            <div className="mapping-field">
              <label>Company Name *</label>
              <select
                value={mapping.company}
                onChange={(e) => setMapping({ ...mapping, company: e.target.value })}
                required
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className="mapping-field">
              <label>Role Title *</label>
              <select
                value={mapping.role_title}
                onChange={(e) => setMapping({ ...mapping, role_title: e.target.value })}
                required
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className="mapping-field">
              <label>Location (optional)</label>
              <select
                value={mapping.location}
                onChange={(e) => setMapping({ ...mapping, location: e.target.value })}
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className="mapping-field">
              <label>Status (optional)</label>
              <select
                value={mapping.status}
                onChange={(e) => setMapping({ ...mapping, status: e.target.value })}
              >
                <option value="">Select column...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <small>We'll normalize status values automatically</small>
            </div>
          </div>

          <div className="import-actions">
            <button onClick={() => setStep(1)} className="btn-secondary">
              Back
            </button>
            <button onClick={handleMapping} className="btn-primary">
              Preview Import
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="import-step">
          <h3>Preview (First 10 Rows)</h3>
          <p>Review your data before importing {csvData.length} total roles</p>

          <div className="preview-table-container">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role Title</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.company}</td>
                    <td>{row.role_title}</td>
                    <td>{row.location || '—'}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-actions">
            <button onClick={() => setStep(2)} className="btn-secondary">
              Back
            </button>
            <button
              onClick={handleImport}
              className="btn-primary"
              disabled={isProcessing}
            >
              {isProcessing ? 'Importing...' : `Import ${csvData.length} Roles`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && importResults && (
        <div className="import-step">
          <h3>✅ Import Complete!</h3>

          <div className="import-results">
            <div className="result-stat">
              <div className="result-number">{importResults.total}</div>
              <div className="result-label">Total Rows</div>
            </div>
            <div className="result-stat success">
              <div className="result-number">{importResults.created}</div>
              <div className="result-label">New Roles Created</div>
            </div>
            <div className="result-stat success">
              <div className="result-number">{importResults.joined}</div>
              <div className="result-label">Roles Joined</div>
            </div>
            {importResults.skipped > 0 && (
              <div className="result-stat warning">
                <div className="result-number">{importResults.skipped}</div>
                <div className="result-label">Already Tracking</div>
              </div>
            )}
          </div>

          {importResults.errors.length > 0 && (
            <div className="import-errors">
              <h4>⚠️ Some rows had errors:</h4>
              <ul>
                {importResults.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
              {importResults.errors.length > 5 && (
                <p>...and {importResults.errors.length - 5} more</p>
              )}
            </div>
          )}

          <div className="import-actions">
            <button onClick={() => navigate('/profile')} className="btn-primary">
              View Your Tracked Roles
            </button>
            <button
              onClick={() => {
                setStep(1);
                setCsvData([]);
                setHeaders([]);
                setMapping({ company: '', role_title: '', location: '', status: '' });
                setPreviewData([]);
                setImportResults(null);
              }}
              className="btn-secondary"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// PROFILE PAGE (User's Tracked Roles)
// ============================================
function ProfilePage() {
  const { user } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [trackedRoles, setTrackedRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [hideRejected, setHideRejected] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/signin');
      return;
    }
    loadTrackedRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadTrackedRoles = async () => {
    try {
      // Get all applications for this user with role details
      const { data: applications, error } = await axios.get(`${API_URL}/tracking/user`);
      
      if (error) throw error;
      
      setTrackedRoles(applications.tracked_roles || []);
    } catch (error) {
      console.error('Error loading tracked roles:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="page">Loading your tracked roles...</div>;
  }

  const statusEmojis = {
    applied: '📝',
    recruiter_screen: '🎯',
    interviewing: '🎤',
    final_round: '🏁',
    rejected: '📩',
    offer: '✅',
  };

  const statusLabels = {
    applied: 'Applied',
    recruiter_screen: 'Recruiter Screen',
    interviewing: 'Interviewing',
    final_round: 'Final Round',
    rejected: 'Rejected',
    offer: 'Offer',
  };

  return (
    <div className="page profile-page">
      <h2>Your Joined Roles</h2>
      <p className="profile-subtitle">
        You're tracking {trackedRoles.length} role{trackedRoles.length !== 1 ? 's' : ''}
      </p>

      {trackedRoles.length > 0 && (
        <div className="profile-filters">
          <div className="filter-group">
            <button 
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button 
              className={`filter-btn ${statusFilter === 'applied' ? 'active' : ''}`}
              onClick={() => setStatusFilter('applied')}
            >
              📝 Applied
            </button>
            <button 
              className={`filter-btn ${statusFilter === 'recruiter_screen' ? 'active' : ''}`}
              onClick={() => setStatusFilter('recruiter_screen')}
            >
              🎯 Recruiter Screen
            </button>
            <button 
              className={`filter-btn ${statusFilter === 'interviewing' ? 'active' : ''}`}
              onClick={() => setStatusFilter('interviewing')}
            >
              🎤 Interviewing
            </button>
            <button 
              className={`filter-btn ${statusFilter === 'final_round' ? 'active' : ''}`}
              onClick={() => setStatusFilter('final_round')}
            >
              🏁 Final Round
            </button>
            <button 
              className={`filter-btn ${statusFilter === 'offer' ? 'active' : ''}`}
              onClick={() => setStatusFilter('offer')}
            >
              ✅ Offer
            </button>
            <button 
              className={`filter-btn ${statusFilter === 'rejected' ? 'active' : ''}`}
              onClick={() => setStatusFilter('rejected')}
            >
              📩 Rejected
            </button>
          </div>
          <label className="hide-rejected-toggle">
            <input
              type="checkbox"
              checked={hideRejected}
              onChange={(e) => setHideRejected(e.target.checked)}
            />
            Hide Rejected
          </label>
        </div>
      )}

      {trackedRoles.length === 0 ? (
        <div className="empty-state">
          <p>You haven't joined any roles yet.</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Find Roles
          </button>
        </div>
      ) : (
        <div className="tracked-roles-grid">
          {trackedRoles
            .filter(item => {
              // Filter by status
              if (statusFilter !== 'all' && item.application.status !== statusFilter) {
                return false;
              }
              // Filter out rejected if hideRejected is true
              if (hideRejected && item.application.status === 'rejected') {
                return false;
              }
              return true;
            })
            .map(item => (
              <div 
                key={item.application.id} 
                className="tracked-role-card"
                onClick={() => navigate(`/role/${item.role.id}`)}
              >
                <div className="tracked-role-header">
                  <h3>{item.role.full_role_name}</h3>
                  <span className={`status-badge status-${item.application.status}`}>
                    {statusEmojis[item.application.status]} {statusLabels[item.application.status]}
                  </span>
                </div>
                {item.role.location && (
                  <p className="role-location">📍 {item.role.location}</p>
                )}
                <div className="tracked-role-meta">
                  <span>Joined {new Date(item.application.applied_at).toLocaleDateString()}</span>
                  {item.application.updated_at !== item.application.applied_at && (
                    <span> • Updated {new Date(item.application.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// AUTH PAGES
// ============================================
function SignUpPage() {
  const { signin } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/auth/signup`, formData);
      signin(response.data.user, response.data.session.access_token);
      navigate('/');
    } catch (error) {
      console.error('Signup error:', error);
      alert(error.response?.data?.error || 'Error signing up');
    }
  };

  return (
    <div className="page auth-page">
      <h2>Sign Up</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          required
          placeholder="Username"
          value={formData.username}
          onChange={(e) => setFormData({...formData, username: e.target.value})}
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
        />
        <button type="submit" className="btn-primary">Sign Up</button>
      </form>
      <p>
        Already have an account? <Link to="/signin">Sign In</Link>
      </p>
    </div>
  );
}

function SignInPage() {
  const { signin } = React.useContext(AuthContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/auth/signin`, formData);
      signin(response.data.user, response.data.session.access_token);
      navigate('/');
    } catch (error) {
      console.error('Signin error:', error);
      alert(error.response?.data?.error || 'Error signing in');
    }
  };

  return (
    <div className="page auth-page">
      <h2>Sign In</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="email"
          required
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
        />
        <button type="submit" className="btn-primary">Sign In</button>
      </form>
      <p>
        Don't have an account? <Link to="/signup">Sign Up</Link>
      </p>
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================
function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Header />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/create-role" element={<CreateRolePage />} />
              <Route path="/role/:id" element={<RolePage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/signin" element={<SignInPage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
