import React from 'react';
import { LandingPage, LandingPageProps } from './LandingPage';

export const PublicLandingPage: React.FC<LandingPageProps> = (props) => {
  return <LandingPage {...props} />;
};

export default PublicLandingPage;
