from datetime import UTC, datetime


class RelojSistema:
    def ahora(self) -> datetime:
        # Se guarda en UTC; la zona de Lima se aplica solo al mostrar.
        return datetime.now(UTC)
