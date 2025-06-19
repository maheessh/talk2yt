// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import './index.css'
// import App from './App.tsx'

// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )

// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // Keep this for minimal global/body styles
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css'; // Import Mantine's core styles

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* MantineProvider wraps your entire application */}
    <MantineProvider defaultColorScheme="dark"> {/* You can choose 'light' or 'dark' */}
      <App />
    </MantineProvider>
  </React.StrictMode>,
);