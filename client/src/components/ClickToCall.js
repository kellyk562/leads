import React from 'react';
import { FaPhone } from 'react-icons/fa';

function ClickToCall({ phone, leadId, dispensaryName, children, style, className }) {
  const handleClick = (e) => {
    // Store pending call info so auto-log prompt fires when user returns
    sessionStorage.setItem('pendingCall', JSON.stringify({
      leadId,
      dispensaryName,
      calledAt: Date.now(),
    }));
    // Don't prevent default — let the browser follow the tel: link
  };

  if (!phone) return children || null;

  return (
    <a
      href={`tel:${phone}`}
      onClick={handleClick}
      style={{ color: '#2d5a27', textDecoration: 'none', ...style }}
      className={className}
    >
      {children || <><FaPhone size={10} /> {phone}</>}
    </a>
  );
}

export default ClickToCall;
