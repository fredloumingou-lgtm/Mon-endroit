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

Ces contrôles simples ne testent pas les clics dans un navigateur, le décodage
des images, ni la disponibilité des sites externes. Les vérifications navigateur
prévues dans AGENTS.md restent nécessaires lors des modifications du site.
La publication GitHub Pages existante peut se déclencher après une fusion :
ne fusionner ou publier qu’avec l’accord explicite du propriétaire.
