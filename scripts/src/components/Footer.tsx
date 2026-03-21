import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer style={{
      backgroundColor: '#f9fafb',
      borderTop: '1px solid #e5e7eb',
      marginTop: 'auto',
      padding: '24px 16px',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '20px',
          fontSize: '13px',
          color: '#374151',
          flexWrap: 'wrap',
        }}>
          <Link
            to="/legal/mentions-legales"
            style={{
              color: '#374151',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#15803d'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#374151'}
          >
            Mentions légales
          </Link>
          <span style={{ color: '#d1d5db' }}>•</span>
          <Link
            to="/legal/cgu"
            style={{
              color: '#374151',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#15803d'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#374151'}
          >
            CGU
          </Link>
          <span style={{ color: '#d1d5db' }}>•</span>
          <Link
            to="/legal/cgv"
            style={{
              color: '#374151',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#15803d'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#374151'}
          >
            CGV
          </Link>
          <span style={{ color: '#d1d5db' }}>•</span>
          <Link
            to="/legal/confidentialite"
            style={{
              color: '#374151',
              textDecoration: 'none',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#15803d'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#374151'}
          >
            Confidentialité
          </Link>
        </div>
        <div style={{
          textAlign: 'center',
          fontSize: '12px',
          color: '#6b7280',
          marginTop: '12px',
        }}>
          © {new Date().getFullYear()} ComptaApp - SHOPTOO
        </div>
      </div>
    </footer>
  );
}
