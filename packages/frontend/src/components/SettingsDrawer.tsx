import {
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  HStack,
  Heading,
  Box,
} from '@chakra-ui/react';
import { Settings as SettingsIcon } from 'lucide-react';
import SettingsContent from '../pages/SettingsContent';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Right-side overlay for SettingsContent. Lets the user tweak settings without
 * navigating away from the current page. The /settings route still works as a
 * deep-link fallback (it renders the same content, just full-page).
 */
export function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="xl">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <HStack spacing={2}>
            <Box as={SettingsIcon} boxSize={5} color="brand.600" />
            <Heading size="md">Settings</Heading>
          </HStack>
        </DrawerHeader>
        <DrawerBody py={6} bg="gray.50">
          <SettingsContent embedded />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

export default SettingsDrawer;
