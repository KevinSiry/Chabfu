/**
 * Point d'entrée : récupère la sauvegarde du serveur avant de lancer le jeu, car les modules
 * du jeu lisent leur partie dans le navigateur dès leur chargement.
 */
import { bootSave } from './save/sync';

bootSave()
  .catch((e) => console.error('Sauvegarde : démarrage sans le serveur', e))
  .finally(() => import('./main'));
