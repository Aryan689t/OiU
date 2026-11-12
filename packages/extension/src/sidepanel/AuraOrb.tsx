import React from "react";
import { AuraSignalArc, AuraSignalState } from "./AuraSignalArc";

export type AuraOrbState = AuraSignalState;

interface AuraOrbProps {
  state: AuraOrbState;
  audioLevel?: number;
  isVoiceActive?: boolean;
  targetName?: string;
  statusLabel?: string;
  statusSubtext?: string;
  onClick?: () => void;
}

/**
 * Backward-compatible adapter forwarding to the new AURA Signal Arc instrument.
 */
export const AuraOrb: React.FC<AuraOrbProps> = (props) => {
  return <AuraSignalArc {...props} />;
};

export { AuraSignalArc };
