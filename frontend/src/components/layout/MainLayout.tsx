import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function MainLayout() {
  return (
    <>
      <Navbar />
      <div className="flex-1 w-full relative z-0">
        <Outlet />
      </div>
    </>
  );
}
