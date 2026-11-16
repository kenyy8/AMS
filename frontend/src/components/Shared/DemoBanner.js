import React from 'react';
export default function DemoBanner() {
  if (process.env.REACT_APP_HOSTED_DEMO !== 'true') return null;
  return <aside role="status" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:20000,background:'#fef3c7',color:'#713f12',borderTop:'2px solid #d97706',padding:'8px 14px',textAlign:'center',fontSize:13}}><strong>DEMO SYSTEM — Fictional Data</strong><br />Class demonstration only. Changes are temporary and are lost when the free service restarts or spins down.</aside>;
}
