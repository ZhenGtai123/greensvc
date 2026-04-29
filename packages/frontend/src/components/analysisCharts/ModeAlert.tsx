import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Box,
  Button,
  HStack,
  CloseButton,
  Text,
} from '@chakra-ui/react';

interface ModeAlertProps {
  analysisMode: 'zone_level' | 'image_level';
  zoneSource: 'user' | 'cluster' | null;
  projectId: string | null;
  zoneCount: number;
  imageCount: number;
  onRunClustering: () => void;
  isClusteringRunning: boolean;
  canRunClustering: boolean;
}

const SESSION_KEY_PREFIX = 'scenerx.modeAlert.dismissed:';

export function ModeAlert({
  analysisMode,
  zoneSource,
  projectId,
  zoneCount,
  imageCount,
  onRunClustering,
  isClusteringRunning,
  canRunClustering,
}: ModeAlertProps) {
  const navigate = useNavigate();
  const sessionKey = projectId ? `${SESSION_KEY_PREFIX}${projectId}` : null;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!sessionKey) return false;
    return sessionStorage.getItem(sessionKey) === '1';
  });

  // Reset dismissal when project changes
  useEffect(() => {
    if (!sessionKey) return;
    setDismissed(sessionStorage.getItem(sessionKey) === '1');
  }, [sessionKey]);

  if (analysisMode !== 'image_level') return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    if (sessionKey) sessionStorage.setItem(sessionKey, '1');
    setDismissed(true);
  };

  const handleAddZone = () => {
    if (projectId) navigate(`/projects/${projectId}/edit`);
  };

  const isClusterDerived = zoneSource === 'cluster';

  return (
    <Alert status="warning" mb={4} borderRadius="md" alignItems="flex-start">
      <AlertIcon mt={1} />
      <Box flex="1">
        <HStack justify="space-between" align="start">
          <AlertTitle fontSize="sm">
            {isClusterDerived ? 'Sub-Zone Mode' : 'Single-Zone (Image-Level) Mode'}
          </AlertTitle>
          <CloseButton size="sm" onClick={handleDismiss} aria-label="Dismiss for this session" />
        </HStack>
        <AlertDescription>
          <Text fontSize="sm" mt={1}>
            {isClusterDerived
              ? `Falling back to image-level statistics on ${imageCount} GPS points (sub-zones derived from clustering, treated as zones).`
              : `Cross-zone z-scores require ≥ 2 zones. With only ${zoneCount} zone${
                  zoneCount === 1 ? '' : 's'
                }, falling back to image-level statistics on ${imageCount} GPS points.`}
          </Text>
          <Text fontSize="xs" color="gray.600" mt={1}>
            To unlock zone-level comparisons:
          </Text>
          <HStack spacing={2} mt={2} flexWrap="wrap">
            <Button
              size="xs"
              colorScheme="teal"
              onClick={onRunClustering}
              isLoading={isClusteringRunning}
              isDisabled={!canRunClustering}
              loadingText="Clustering..."
            >
              Run Clustering
            </Button>
            <Button
              size="xs"
              colorScheme="blue"
              variant="outline"
              onClick={handleAddZone}
              isDisabled={!projectId}
            >
              Add Another Zone
            </Button>
            <Button size="xs" variant="ghost" onClick={handleDismiss}>
              Continue with Image-Level
            </Button>
          </HStack>
        </AlertDescription>
      </Box>
    </Alert>
  );
}
