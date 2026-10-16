import React from 'react';
import { GenesisEngine, GenesisEngineProps } from './GenesisEngine';

export type GenesisEngineAnimationProps = GenesisEngineProps;

export const GenesisEngineAnimation: React.FC<GenesisEngineAnimationProps> = (props) => {
  return <GenesisEngine {...props} />;
};

export { GenesisEngine };
