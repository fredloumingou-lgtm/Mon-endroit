# Vérifications automatiques

Le workflow « Vérifications du site » contrôle chaque pull request et chaque
modification de `main`. Il peut aussi être lancé manuellement dans GitHub Actions.
Il vérifie la structure HTML, les chemins locaux (avec leur casse exacte),
les images des modèles JavaScript et les ancres des liens internes.

Pour lancer les mêmes contrôles depuis la racine du dépôt :

```sh
npx --yes htmlhint@1.9.2 --config .htmlhintrc '**/*.html'
python3 scripts/check_site.py
```

Le résultat apparaît dans les contrôles de la pull request. Une erreur indique
le fichier et le chemin concernés. Le workflow ne corrige rien automatiquement,
n’utilise aucun secret, ne possède qu’un accès en lecture et ne publie rien.
Il ne change ni GitHub Pages ni les protections de branche. Un contrôle rouge
ne bloque pas nécessairement la fusion : cela dépend des protections existantes.

Le workflow exécute aussi les tests navigateur avec Chromium et axe-core :
affichage à 320, 390, 768 et 1 440 pixels, images, navigation interne, boutons
musique/séries au clavier, états sélectionnés, contrastes et autres règles
d’accessibilité automatisables. Il vérifie également le lien d’évitement,
la préférence de réduction des mouvements, le zoom à 200 % et les liens
de navigation sans JavaScript. Les pages sont servies sous `/Mon-endroit/`
pour tester les chemins relatifs d’un site GitHub Pages de projet.

Pour reproduire les tests navigateur (Node.js 20 ou ultérieur) :

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install chromium
npm test
```

Un Chromium système installé dans `/usr/bin/chromium` est aussi accepté.
`CHROMIUM_PATH` permet de choisir un autre exécutable local si nécessaire.
Les dépendances et leurs versions sont enregistrées dans `package-lock.json`.
Les tests lancent et arrêtent leur propre serveur local sur un port libre.
Ils ne publient rien et n’ont besoin d’aucun secret.

Les requêtes externes sont volontairement bloquées dans les tests navigateur :
ils ne valident pas les vidéos intégrées ni la disponibilité des sites externes.
Les contrôles automatisés ne remplacent pas une vérification visuelle ni un
essai réel avec un lecteur d’écran. Ces vérifications restent à distinguer
des résultats automatisés.
La publication GitHub Pages existante peut se déclencher après une fusion :
ne fusionner ou publier qu’avec l’accord explicite du propriétaire.
